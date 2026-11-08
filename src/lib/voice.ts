import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

// WebRTC mesh for small voice channels. Signaling (offers, answers, ICE) travels over
// Supabase Realtime broadcast on the channel `voice:<channelId>`; presence in the room
// is stored in the voice_states table.
//
// To avoid offer collisions, the peer with the lower user id always creates the offer.

type Signal =
  | { kind: 'join'; from: string }
  | { kind: 'here'; from: string; to: string }
  | { kind: 'offer' | 'answer'; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { kind: 'ice'; from: string; to: string; candidate: RTCIceCandidateInit }
  | { kind: 'leave'; from: string };

interface Peer {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement | null;
  pendingIce: RTCIceCandidateInit[];
}

interface Meter {
  analyser: AnalyserNode;
  buf: Float32Array<ArrayBuffer>;
  speaking: boolean;
}

export interface VoiceSnapshot {
  peerIds: string[];
  speaking: Record<string, boolean>;
}

export interface VoiceOptions {
  userId: string;
  channelId: string;
  inputDeviceId: string;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  outputDeviceId: string;
  outputVolume: number;
  onChange: (snap: VoiceSnapshot) => void;
  onError: (message: string) => void;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
};
const SPEAK_THRESHOLD = 0.02;

export class VoiceSession {
  private opts: VoiceOptions;
  private channel: RealtimeChannel | null = null;
  private local: MediaStream | null = null;
  private peers = new Map<string, Peer>();
  private meters = new Map<string, Meter>();
  private audioCtx: AudioContext | null = null;
  private meterTimer: number | null = null;
  private muted = false;
  private deafened = false;
  private outputVolume: number;

  constructor(opts: VoiceOptions) {
    this.opts = opts;
    this.outputVolume = opts.outputVolume;
  }

  async join(): Promise<void> {
    try {
      this.local = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: this.opts.inputDeviceId ? { exact: this.opts.inputDeviceId } : undefined,
          noiseSuppression: this.opts.noiseSuppression,
          echoCancellation: this.opts.echoCancellation,
          autoGainControl: true,
        },
        video: false,
      });
    } catch (e) {
      this.opts.onError('Microphone access was blocked or no input device was found.');
      throw e;
    }

    this.audioCtx = new AudioContext();
    this.addMeter('local', this.local);
    this.meterTimer = window.setInterval(() => this.tick(), 120);

    this.channel = supabase.channel(`voice:${this.opts.channelId}`, {
      config: { broadcast: { self: false } },
    });
    this.channel
      .on('broadcast', { event: 'signal' }, ({ payload }) => this.onSignal(payload as Signal))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') this.send({ kind: 'join', from: this.opts.userId });
      });
  }

  leave(): void {
    this.send({ kind: 'leave', from: this.opts.userId });
    this.peers.forEach((_p, id) => this.dropPeer(id));
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = null;
    if (this.meterTimer !== null) window.clearInterval(this.meterTimer);
    this.meterTimer = null;
    this.meters.clear();
    void this.audioCtx?.close();
    this.audioCtx = null;
    if (this.channel) void supabase.removeChannel(this.channel);
    this.channel = null;
    this.emit();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.local?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    this.emit();
  }

  setDeafened(deafened: boolean): void {
    this.deafened = deafened;
    this.peers.forEach((p) => {
      if (p.audio) p.audio.muted = deafened;
    });
    this.emit();
  }

  setOutputVolume(volume: number): void {
    this.outputVolume = volume;
    this.peers.forEach((p) => {
      if (p.audio) p.audio.volume = Math.min(1, volume / 100);
    });
  }

  // ---- signaling ----

  private send(payload: Signal) {
    void this.channel?.send({ type: 'broadcast', event: 'signal', payload });
  }

  private async onSignal(s: Signal) {
    const me = this.opts.userId;
    if (s.from === me) return;

    if (s.kind === 'join') {
      this.send({ kind: 'here', from: me, to: s.from });
      if (me < s.from) await this.connect(s.from);
      return;
    }
    if (s.kind === 'here') {
      if (me < s.from) await this.connect(s.from);
      return;
    }
    if (s.kind === 'leave') {
      this.dropPeer(s.from);
      return;
    }
    if ('to' in s && s.to !== me) return;

    if (s.kind === 'offer') {
      const peer = this.peers.get(s.from) ?? this.createPeer(s.from);
      await peer.pc.setRemoteDescription(s.sdp);
      await this.flushIce(s.from);
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      this.send({ kind: 'answer', from: me, to: s.from, sdp: answer });
      return;
    }
    if (s.kind === 'answer') {
      const peer = this.peers.get(s.from);
      if (!peer) return;
      await peer.pc.setRemoteDescription(s.sdp);
      await this.flushIce(s.from);
      return;
    }
    if (s.kind === 'ice') {
      const peer = this.peers.get(s.from);
      if (!peer) return;
      if (peer.pc.remoteDescription) {
        await peer.pc.addIceCandidate(s.candidate).catch(() => undefined);
      } else {
        peer.pendingIce.push(s.candidate);
      }
    }
  }

  private async connect(remote: string) {
    if (this.peers.has(remote)) return;
    const peer = this.createPeer(remote);
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    this.send({ kind: 'offer', from: this.opts.userId, to: remote, sdp: offer });
  }

  private createPeer(remote: string): Peer {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.local?.getTracks().forEach((t) => pc.addTrack(t, this.local as MediaStream));
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.send({ kind: 'ice', from: this.opts.userId, to: remote, candidate: e.candidate.toJSON() });
      }
    };
    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      this.attachRemote(remote, stream);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.dropPeer(remote);
    };
    const peer: Peer = { pc, audio: null, pendingIce: [] };
    this.peers.set(remote, peer);
    return peer;
  }

  private async flushIce(remote: string) {
    const peer = this.peers.get(remote);
    if (!peer) return;
    for (const c of peer.pendingIce.splice(0)) {
      await peer.pc.addIceCandidate(c).catch(() => undefined);
    }
  }

  private attachRemote(remote: string, stream: MediaStream) {
    const peer = this.peers.get(remote);
    if (!peer) return;
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.srcObject = stream;
    audio.muted = this.deafened;
    audio.volume = Math.min(1, this.outputVolume / 100);
    const sink = audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    if (this.opts.outputDeviceId && sink.setSinkId) void sink.setSinkId(this.opts.outputDeviceId).catch(() => undefined);
    document.body.appendChild(audio);
    peer.audio = audio;
    this.addMeter(remote, stream);
    this.emit();
  }

  private dropPeer(remote: string) {
    const peer = this.peers.get(remote);
    if (peer) {
      peer.pc.close();
      peer.audio?.remove();
      this.peers.delete(remote);
    }
    this.meters.delete(remote);
    this.emit();
  }

  // ---- speaking detection ----

  private addMeter(id: string, stream: MediaStream) {
    if (!this.audioCtx || stream.getAudioTracks().length === 0) return;
    const source = this.audioCtx.createMediaStreamSource(stream);
    const analyser = this.audioCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    this.meters.set(id, { analyser, buf: new Float32Array(analyser.fftSize), speaking: false });
  }

  private tick() {
    let changed = false;
    for (const [id, m] of this.meters) {
      m.analyser.getFloatTimeDomainData(m.buf);
      let sum = 0;
      for (let i = 0; i < m.buf.length; i++) sum += m.buf[i] * m.buf[i];
      const rms = Math.sqrt(sum / m.buf.length);
      const silenced = id === 'local' ? this.muted : this.deafened;
      const speaking = !silenced && rms > SPEAK_THRESHOLD;
      if (speaking !== m.speaking) {
        m.speaking = speaking;
        changed = true;
      }
    }
    if (changed) this.emit();
  }

  private emit() {
    const speaking: Record<string, boolean> = {};
    for (const [id, m] of this.meters) speaking[id === 'local' ? this.opts.userId : id] = m.speaking;
    this.opts.onChange({ peerIds: [...this.peers.keys()], speaking });
  }
}

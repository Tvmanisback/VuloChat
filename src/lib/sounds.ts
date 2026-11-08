// Short synthesized cues so the app needs no audio asset files.
type Cue = 'join' | 'leave' | 'mute' | 'unmute' | 'deafen' | 'undeafen' | 'message' | 'mention';

const PATTERNS: Record<Cue, [number, number, number][]> = {
  // [frequency Hz, duration s, gain]
  join: [[520, 0.09, 0.12], [780, 0.12, 0.12]],
  leave: [[780, 0.09, 0.12], [520, 0.12, 0.12]],
  mute: [[440, 0.08, 0.1]],
  unmute: [[660, 0.08, 0.1]],
  deafen: [[330, 0.1, 0.12], [220, 0.12, 0.12]],
  undeafen: [[440, 0.1, 0.12], [660, 0.12, 0.12]],
  message: [[880, 0.06, 0.06]],
  mention: [[988, 0.08, 0.1], [1319, 0.1, 0.1]],
};

let ctx: AudioContext | null = null;

export function playCue(cue: Cue, outputVolume = 100) {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const gainScale = Math.max(0, Math.min(2, outputVolume / 100));
    let t = ctx.currentTime;
    for (const [freq, dur, gain] of PATTERNS[cue]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain * gainScale, t + 0.01);
      g.gain.linearRampToValueAtTime(0, t + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
      t += dur;
    }
  } catch {
    /* audio may be blocked until a user gesture */
  }
}

import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { REPORT_REASONS, submitReport, type ReportReason } from '../lib/reports';
import { Button, ErrorText, Field, Modal, inputClass } from './ui';

export interface ReportTarget {
  type: 'message' | 'direct_message' | 'profile';
  /** The message or profile id being reported. */
  id: string;
  /** The person who wrote the message, or the profile's owner. */
  userId: string | null;
  serverId: string | null;
  /** The reported text, kept with the report so it can be reviewed after a deletion. */
  snapshot: string | null;
  /** Shown in the dialog title: "message" or "profile". */
  what: string;
}

export default function ReportDialog({ target, onClose }: { target: ReportTarget; onClose: () => void }) {
  const { session } = useAuth();
  const [reason, setReason] = useState<ReportReason>('harassment');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!session || busy) return;
    setBusy(true);
    setError(null);
    try {
      await submitReport({
        reporterId: session.user.id,
        targetType: target.type,
        targetId: target.id,
        targetUserId: target.userId,
        serverId: target.serverId,
        reason,
        details,
        snapshot: target.snapshot,
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the report.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Modal title="Report sent" onClose={onClose} footer={<Button onClick={onClose}>Done</Button>}>
        <p className="text-sm text-vulo-text">
          Thanks. The project owner reviews reports. The person you reported is not told who reported them.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      title={`Report ${target.what}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="report-form" disabled={busy}>
            {busy ? 'Sending…' : 'Send report'}
          </Button>
        </>
      }
    >
      <form id="report-form" onSubmit={send} noValidate>
        <ErrorText>{error}</ErrorText>
        <fieldset className="mb-4 space-y-2">
          <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-vulo-muted">Reason</legend>
          {REPORT_REASONS.map((r) => (
            <label key={r.id} className="flex cursor-pointer items-center gap-3 rounded bg-vulo-side px-4 py-2.5">
              <input
                type="radio"
                name="report-reason"
                value={r.id}
                checked={reason === r.id}
                onChange={() => setReason(r.id)}
                className="accent-[#7c5cff]"
              />
              <span className="text-sm text-vulo-bright">{r.label}</span>
            </label>
          ))}
        </fieldset>
        <Field label="More details (optional)">
          <textarea className={inputClass} rows={3} maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

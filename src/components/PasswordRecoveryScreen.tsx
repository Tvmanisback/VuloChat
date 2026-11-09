import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { Button, ErrorText, Field, Logo, inputClass } from './ui';

export default function PasswordRecoveryScreen() {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Your password must be at least 8 characters.');
    if (password !== confirm) return setError('The passwords do not match.');
    setBusy(true);
    try {
      await updatePassword(password);
      window.history.replaceState({}, '', window.location.pathname);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-vulo-rail p-4">
      <div className="w-full max-w-[480px] rounded-lg bg-vulo-chat p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo className="mb-3 h-14 w-14" />
          <h1 className="text-2xl font-bold text-vulo-bright">Choose a new password</h1>
          <p className="mt-1 text-sm text-vulo-muted">Your new password must be at least 8 characters.</p>
        </div>
        <form onSubmit={submit}>
          <ErrorText>{error}</ErrorText>
          <Field label="New password">
            <input className={inputClass} type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
          </Field>
          <Field label="Confirm new password">
            <input className={inputClass} type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" minLength={8} required />
          </Field>
          <Button type="submit" disabled={busy} className="mt-2 w-full py-3">{busy ? 'Updating…' : 'Update password'}</Button>
        </form>
      </div>
    </div>
  );
}

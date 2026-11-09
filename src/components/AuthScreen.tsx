import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { Button, ErrorText, Field, Logo, inputClass } from './ui';

export default function AuthScreen() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === 'reset') {
        await resetPassword(email.trim());
        setNotice('If an account exists for that email, a password reset link has been sent. Check your inbox.');
      } else if (mode === 'login') {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password, username);
        setNotice('Account created. Check your inbox for a confirmation link, then log in.');
        setMode('login');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const isLogin = mode === 'login';
  const isReset = mode === 'reset';

  return (
    <div className="flex h-full items-center justify-center bg-vulo-rail p-4">
      <div className="w-full max-w-[480px] rounded-lg bg-vulo-chat p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo className="mb-3 h-14 w-14" />
          <h1 className="text-2xl font-bold text-vulo-bright">{isReset ? 'Reset your password' : isLogin ? 'Welcome back' : 'Create your account'}</h1>
          <p className="mt-1 text-sm text-vulo-muted">
            {isReset ? 'Enter your account email and we’ll send you a reset link.' : isLogin ? 'Log in to pick up your conversations.' : 'Free forever. Takes under a minute.'}
          </p>
        </div>

        <form onSubmit={submit} noValidate>
          <ErrorText>{error}</ErrorText>
          {notice && <p className="mb-3 rounded bg-vulo-green/10 px-3 py-2 text-sm text-vulo-green">{notice}</p>}

          {!isLogin && !isReset && (
            <Field label="Username" hint="Lowercase letters, numbers, underscores and dots. 2–32 characters.">
              <input
                className={inputClass}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                minLength={2}
                maxLength={32}
              />
            </Field>
          )}

          <Field label="Email">
            <input
              className={inputClass}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </Field>

          {!isReset && <Field label="Password">
            <input
              className={inputClass}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              required
              minLength={8}
            />
          </Field>}

          <Button type="submit" disabled={busy} className="mt-2 w-full py-3">
            {busy ? 'Please wait…' : isReset ? 'Send reset link' : isLogin ? 'Log in' : 'Continue'}
          </Button>
        </form>

        {isLogin && <p className="mt-3 text-sm"><button type="button" className="text-[#00a8fc] hover:underline" onClick={() => { setError(null); setNotice(null); setMode('reset'); }}>Forgot password?</button></p>}

        <p className="mt-4 text-sm text-vulo-muted">
          {isReset ? 'Remembered it? ' : isLogin ? 'Need an account? ' : 'Already have an account? '}
          <button
            type="button"
            className="text-[#00a8fc] hover:underline"
            onClick={() => {
              setError(null);
              setNotice(null);
              setMode(isReset ? 'login' : isLogin ? 'register' : 'login');
            }}
          >
            {isReset ? 'Log in' : isLogin ? 'Register' : 'Log in'}
          </button>
        </p>

        <nav className="mt-6 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-vulo-muted" aria-label="Legal and help">
          {[
            ['terms', 'Terms of Service'],
            ['privacy', 'Privacy Policy'],
            ['faq', 'FAQ'],
          ].map(([id, label]) => (
            <a
              key={id}
              className="hover:text-vulo-text hover:underline"
              href={`${import.meta.env.BASE_URL}info.html#${id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {label}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}

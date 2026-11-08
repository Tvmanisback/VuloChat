import { useEffect, useState, type FormEvent } from 'react';
import ReactDOM from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import './index.css';
import { Button, ErrorText, Field, Logo, inputClass } from './components/ui';
import { SUPABASE_KEY, SUPABASE_URL } from './lib/config';
import { CONFIRM_URL } from './lib/site';

// This page reads the confirmation link itself, so it uses its own client with URL
// detection off. The shared client would otherwise consume the link first. Both
// clients save the session under the same storage key, so VuloChat picks it up.
const auth = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
}).auth;

type Status = 'checking' | 'confirmed' | 'failed' | 'no-link';

function openApp() {
  window.location.assign('./');
}

function ConfirmPage() {
  const [status, setStatus] = useState<Status>('checking');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    // Supabase puts the result in the hash (implicit flow) or the query (PKCE flow).
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    // Remove the link from the address bar so a refresh does not replay it.
    window.history.replaceState(null, '', window.location.pathname);

    const linkError =
      hash.get('error_description') ?? query.get('error_description') ?? hash.get('error') ?? query.get('error');
    const code = query.get('code');
    const accessToken = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');

    (async () => {
      try {
        if (linkError) throw new Error(linkError);
        if (code) {
          const { error: exchangeError } = await auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else if (accessToken && refreshToken) {
          const { error: sessionError } = await auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) throw sessionError;
        } else {
          // Opened without a link: confirmed if a session already exists here.
          const { data } = await auth.getSession();
          setStatus(data.session ? 'confirmed' : 'no-link');
          return;
        }
        setStatus('confirmed');
      } catch {
        // Expired and already-used links both land here. With the PKCE flow, a link
        // opened in another browser also fails, even though the email is confirmed.
        setStatus('failed');
      }
    })();
  }, []);

  const resend = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: resendError } = await auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: CONFIRM_URL },
    });
    setBusy(false);
    if (resendError) setError(resendError.message);
    else setResent(true);
  };

  const resendForm = (
    <form onSubmit={resend} noValidate className="mt-6 text-left">
      <ErrorText>{error}</ErrorText>
      {resent && (
        <p className="mb-3 rounded bg-vulo-green/10 px-3 py-2 text-sm text-vulo-green">
          If an account exists for that address, a new link is on its way.
        </p>
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
      <Button type="submit" disabled={busy} className="w-full py-3">
        {busy ? 'Please wait…' : 'Send a new link'}
      </Button>
    </form>
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-vulo-rail p-4">
      <div className="w-full max-w-[480px] rounded-lg bg-vulo-chat p-8 text-center shadow-2xl">
        <Logo className="mx-auto mb-4 h-14 w-14" />

        {status === 'checking' && <p className="text-sm text-vulo-muted">Confirming your email…</p>}

        {status === 'confirmed' && (
          <>
            <h1 className="text-2xl font-bold text-vulo-bright">Email confirmed</h1>
            <p className="mt-2 text-sm text-vulo-muted">Your account is ready. Open VuloChat to start chatting.</p>
            <Button type="button" onClick={openApp} className="mt-6 w-full py-3">
              Open VuloChat
            </Button>
          </>
        )}

        {status === 'failed' && (
          <>
            <h1 className="text-2xl font-bold text-vulo-bright">This link didn’t work</h1>
            <p className="mt-2 text-sm text-vulo-muted">
              It may have expired or already been used. If you confirmed earlier, you can log in now. Otherwise,
              send a new link below.
            </p>
            <Button type="button" variant="secondary" onClick={openApp} className="mt-6 w-full py-3">
              Go to log in
            </Button>
            {resendForm}
          </>
        )}

        {status === 'no-link' && (
          <>
            <h1 className="text-2xl font-bold text-vulo-bright">Check your email</h1>
            <p className="mt-2 text-sm text-vulo-muted">
              Open the confirmation link from your inbox. Didn’t get it? Send a new one below.
            </p>
            {resendForm}
          </>
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<ConfirmPage />);

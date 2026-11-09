import { useEffect } from 'react';
import { useAuth } from './lib/auth';
import AuthScreen from './components/AuthScreen';
import AppShell from './components/AppShell';
import { Splash } from './components/ui';
import { VoiceProvider } from './lib/voiceContext';
import { supabase } from './lib/supabase';
import PasswordRecoveryScreen from './components/PasswordRecoveryScreen';

export default function App() {
  const { session, profile, loading } = useAuth();

  // Keep Spotify activity fresh while the signed-in user has VuloChat open.
  useEffect(() => {
    if (!session) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        void supabase.functions.invoke('connections', { body: { action: 'refresh_spotify' } });
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [session]);

  if (loading) return <Splash />;
  if (new URLSearchParams(window.location.search).get('reset-password') === 'true' && session) return <PasswordRecoveryScreen />;
  if (!session) return <AuthScreen />;
  if (!profile) return <Splash label="Setting up your profile…" />;

  return (
    <VoiceProvider>
      <AppShell />
    </VoiceProvider>
  );
}

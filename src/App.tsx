import { useAuth } from './lib/auth';
import AuthScreen from './components/AuthScreen';
import AppShell from './components/AppShell';
import { Splash } from './components/ui';
import { VoiceProvider } from './lib/voiceContext';

export default function App() {
  const { session, profile, loading } = useAuth();

  if (loading) return <Splash />;
  if (!session) return <AuthScreen />;
  if (!profile) return <Splash label="Setting up your profile…" />;

  return (
    <VoiceProvider>
      <AppShell />
    </VoiceProvider>
  );
}

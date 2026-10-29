import { AuthPage } from './components/AuthPage';
import { Logo } from './components/Logo';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { MessengerPage } from './MessengerPage';

function Splash() {
  return (
    <div className="splash">
      <Logo size={56} />
      <span className="splash__name">xam</span>
      <span className="splash__hint">Загружаем профиль…</span>
    </div>
  );
}

function Root() {
  const { status, token, user } = useAuth();

  if (status === 'loading') {
    return <Splash />;
  }

  if (status === 'guest' || !token || !user) {
    return <AuthPage />;
  }

  return <MessengerPage token={token} user={user} />;
}

export default function App() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}

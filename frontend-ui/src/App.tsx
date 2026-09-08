import { AuthProvider } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';
import AuthPage from './pages/AuthPage';
import ChatPage from './pages/ChatPage';
import './App.css';

function AppShell() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-loading">
        <p>Loading…</p>
      </div>
    );
  }

  return user ? <ChatPage /> : <AuthPage />;
}

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

export default App;

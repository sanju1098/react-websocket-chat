// Hook for consuming the AuthContext (kept in its own file so
// AuthContext.tsx only exports components/context, per Fast Refresh rules).
import { useContext } from 'react';
import { AuthContext } from '../context/auth-context';

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

"use client";
import { useAuth } from '@/lib/useAuth';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth(true);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p>Checking session…</p>
      </div>
    );
  }

  return <>{children}</>;
}

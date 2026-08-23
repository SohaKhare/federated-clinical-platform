"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth(true);
  const router = useRouter();

  const needsOnboarding = !!user && user.role === 'local' && !user.onboarded;

  useEffect(() => {
    if (!loading && needsOnboarding) {
      router.replace('/onboarding');
    }
  }, [loading, needsOnboarding, router]);

  if (loading || !user || needsOnboarding) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p>Checking session…</p>
      </div>
    );
  }

  return <>{children}</>;
}

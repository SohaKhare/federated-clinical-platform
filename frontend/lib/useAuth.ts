"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type AuthUser } from './api';

export function useAuth(redirectToLogin = false) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    api.getMe()
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch(() => {
        if (!cancelled && redirectToLogin) {
          router.replace('/login');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [redirectToLogin, router]);

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      router.replace('/login');
    }
  };

  return { user, loading, logout };
}

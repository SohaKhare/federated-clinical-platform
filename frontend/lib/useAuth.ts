"use client";
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type AuthUser } from './api';

export function useAuth(redirectToLogin = false) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const load = useCallback(() => {
    return api.getMe()
      .then((u) => {
        setUser(u);
        if (!u && redirectToLogin) router.replace('/login');
        return u;
      })
      .catch(() => {
        setUser(null);
        if (redirectToLogin) router.replace('/login');
        return null;
      })
      .finally(() => setLoading(false));
  }, [redirectToLogin, router]);

  useEffect(() => {
    let cancelled = false;
    if (!cancelled) load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      router.replace('/login');
    }
  };

  return { user, loading, logout, refresh: load };
}

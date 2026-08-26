// Which backend the dashboard talks to.
//
// The platform runs two independent Express servers — the local hospital
// node (:8000) and the global aggregator (:8010). Each mounts its resource
// routes under a matching path prefix (/local/*, /global/*), so once the
// role is known both "which server" and "which path" fall out of it.
//
// The role is cached in localStorage purely to pick a backend to ask before
// the first /auth/me response comes back (e.g. on a hard refresh). The
// database's role is always the source of truth — /auth/me's response
// overwrites whatever was cached the moment it returns.

export type UserRole = 'local' | 'global';

export const BASE_URLS: Record<UserRole, string> = {
  local: process.env.NEXT_PUBLIC_LOCAL_API_URL ?? 'http://localhost:8000',
  global: process.env.NEXT_PUBLIC_GLOBAL_API_URL ?? 'http://localhost:8010',
};

const STORAGE_KEY = 'fcp.role';

export function isUserRole(value: unknown): value is UserRole {
  return value === 'local' || value === 'global';
}

export function getStoredRole(): UserRole {
  if (typeof window === 'undefined') return 'local';

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isUserRole(stored) ? stored : 'local';
  } catch {
    // Private browsing modes can throw on localStorage access.
    return 'local';
  }
}

export function setStoredRole(role: UserRole) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, role);
  } catch {
    // Non-fatal — the role just won't survive a refresh.
  }
}

export function clearStoredRole() {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Non-fatal.
  }
}

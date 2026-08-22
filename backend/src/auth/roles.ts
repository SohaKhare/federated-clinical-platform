export const USER_ROLES = ["local", "global"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export function isValidRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

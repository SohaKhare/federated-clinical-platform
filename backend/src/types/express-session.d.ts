import type { UserRole } from "../auth/roles.js";

declare module "express-session" {
  interface SessionData {
    oauthState?: string;

    oauthNode?: UserRole;

    user?: {
      userId: string;
      googleId: string;
      email: string;
      name?: string;
      picture?: string;
      node: UserRole;
      role: UserRole;
      onboarded: boolean;
    };
  }
}

import type { UserRole } from "../auth/roles.js";

declare module "express-session" {
  interface SessionData {
    oauthState?: string;

    user?: {
      userId: string;
      googleId: string;
      email: string;
      hospitalName?: string;
      picture?: string;
      node: UserRole;
      role: UserRole;
      onboarded: boolean;
    };
  }
}

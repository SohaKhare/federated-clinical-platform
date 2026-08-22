import { google } from "googleapis";

import { env } from "../config/env.js";
import type { UserRole } from "../auth/roles.js";

export type { UserRole };

export function getGoogleClient(node: UserRole) {
  const config = node === "local" ? env.localGoogle : env.globalGoogle;

  return new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri,
  );
}

export function getGoogleClientId(node: UserRole): string {
  return node === "local"
    ? env.localGoogle.clientId
    : env.globalGoogle.clientId;
}

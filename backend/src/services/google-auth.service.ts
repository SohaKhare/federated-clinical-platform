import { google } from "googleapis";

import { env } from "../config/env.js";

export type GoogleNode = "local" | "global";

export function getGoogleClient(node: GoogleNode) {
  const config = node === "local" ? env.localGoogle : env.globalGoogle;

  return new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri,
  );
}

export function getGoogleClientId(node: GoogleNode): string {
  return node === "local"
    ? env.localGoogle.clientId
    : env.globalGoogle.clientId;
}

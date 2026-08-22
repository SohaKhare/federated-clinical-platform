import { google } from "googleapis";
import { env } from "../config/env.js";
export function getGoogleClient() {
    return new google.auth.OAuth2(env.google.clientId, env.google.clientSecret, env.google.redirectUri);
}
export function getGoogleClientId() {
    return env.google.clientId;
}
//# sourceMappingURL=google-auth.service.js.map
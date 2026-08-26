import jwt from "jsonwebtoken";

import { env } from "./env.js";

export interface AuthTokenPayload {
  userId: string;
}

/** Only the user id is signed — role/onboarded/hospitalName can change after
 * a token is issued (role is promoted by editing the database directly), so
 * every request re-reads the current row instead of trusting stale claims. */
export function signAuthToken(payload: AuthTokenPayload): string {
  // env.jwt.expiresIn is a plain string from process.env — jsonwebtoken's
  // types want its narrower `StringValue` (e.g. "7d"), which a runtime env
  // var can't be statically proven to satisfy.
  const options: jwt.SignOptions = {
    expiresIn: env.jwt.expiresIn as NonNullable<jwt.SignOptions["expiresIn"]>,
  };

  return jwt.sign(payload, env.jwt.secret, options);
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.jwt.secret);

    if (typeof decoded === "string" || !decoded.userId) return null;

    return { userId: String(decoded.userId) };
  } catch {
    return null;
  }
}

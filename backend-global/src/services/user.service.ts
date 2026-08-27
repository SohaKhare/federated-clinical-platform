import { supabase } from "../config/supabase.js";
import { isValidRole } from "../auth/roles.js";
import { env } from "../config/env.js";
import type {
  OnboardingInput,
  UserSession,
} from "../interfaces/model/user.interface.js";
import type { Database } from "../types/supabase.js";

type UserRow = Database["public"]["Tables"]["users"]["Row"];

/**
 * Upserts the Google-authenticated user, stamping their row with this node's
 * own role (env.nodeRole). Logging in via the global server promotes the
 * account to "global"; logging in via a hospital server sets it back to
 * "local" — the last node signed into wins, which matches how the frontend
 * routes requests off the stored role.
 */
export async function upsertLocalUser(input: {
  googleId: string;
  email: string;
  picture?: string;
}): Promise<UserSession> {
  const { data: existing, error: lookupError } = await supabase
    .from("users")
    .select()
    .eq("google_id", input.googleId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(lookupError.message);
  }

  if (existing) {
    // Existing user: refresh profile fields and align the role with the node
    // that handled this login, so choosing "Global node" on the login screen
    // promotes the account automatically — no manual database edits needed.
    const { data, error } = await supabase
      .from("users")
      .update({
        email: input.email,
        role: env.nodeRole,
        ...(input.picture !== undefined ? { picture: input.picture } : {}),
      })
      .eq("google_id", input.googleId)
      .select()
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Failed to update user.");
    }

    return toUserSession(data);
  }

  const { data, error } = await supabase
    .from("users")
    .insert({
      google_id: input.googleId,
      email: input.email,
      role: env.nodeRole,
      ...(input.picture !== undefined ? { picture: input.picture } : {}),
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create user.");
  }

  return toUserSession(data);
}

/** Re-reads a user's current row — used to refresh a session against the DB on every /auth/me call. */
export async function getUserById(userId: string): Promise<UserSession | null> {
  const { data, error } = await supabase
    .from("users")
    .select()
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? toUserSession(data) : null;
}

export async function completeOnboarding(
  userId: string,
  input: OnboardingInput,
): Promise<UserSession> {
  const { data, error } = await supabase
    .from("users")
    .update({
      hospital_name: input.hospitalName,
      pincode: input.pincode,
      geolocation: input.geolocation,
    })
    .eq("user_id", userId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update user.");
  }

  return toUserSession(data);
}

function toUserSession(user: UserRow): UserSession {
  if (!isValidRole(user.role)) {
    throw new Error(`User ${user.user_id} has an invalid role: ${user.role}`);
  }

  return {
    userId: user.user_id,
    googleId: user.google_id,
    email: user.email,
    ...(user.hospital_name ? { hospitalName: user.hospital_name } : {}),
    ...(user.picture ? { picture: user.picture } : {}),
    node: user.role,
    role: user.role,
    onboarded: Boolean(user.hospital_name && user.pincode),
  };
}

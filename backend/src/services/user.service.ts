import { supabase } from "../config/supabase.js";
import { isValidRole } from "../auth/roles.js";
import type { OnboardingInput, UserSession } from "../interfaces/model/user.interface.js";
import type { Database } from "../types/supabase.js";

type UserRow = Database["public"]["Tables"]["users"]["Row"];

/**
 * All Google logins create a "local" user by default. A user is promoted to
 * "global" by manually updating their role in the database.
 */
export async function upsertLocalUser(input: {
  googleId: string;
  email: string;
  picture?: string;
}): Promise<UserSession> {
  const { data, error } = await supabase
    .from("users")
    .upsert(
      {
        google_id: input.googleId,
        email: input.email,
        role: "local",
        ...(input.picture !== undefined ? { picture: input.picture } : {}),
      },
      { onConflict: "google_id" },
    )
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to upsert user.");
  }

  return toUserSession(data);
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

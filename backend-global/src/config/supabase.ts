import { createClient } from "@supabase/supabase-js";

import { env } from "./env.js";

/**
 * Service-role client: the backend is a trusted server that must bypass the
 * RLS policies enabled on every table (see supabase/migrations/001), same
 * trust level Prisma had via a direct Postgres connection. Never send this
 * key to a browser.
 *
 * Left untyped (no generic `Database` schema) rather than fighting
 * supabase-js's generic contract without a real linked project to generate
 * types from — see types/supabase.ts for the hand-maintained row shapes
 * services cast query results to instead.
 */
export const supabase = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
  auth: { persistSession: false },
});

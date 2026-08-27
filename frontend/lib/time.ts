/**
 * Shared timestamp parsing helpers.
 *
 * Supabase (PostgREST) serializes `timestamptz` columns as ISO strings with
 * the timezone designator stripped — e.g. "2026-08-27T04:44:02.892". Those
 * values are UTC wall times, but `new Date()` parses offset-less strings as
 * *local* time, so on an IST machine raw UTC leaks straight through any
 * `toLocaleString(..., { timeZone: 'Asia/Kolkata' })` call unchanged. Always
 * parse API timestamps through `parseUtcIso` before formatting.
 */

/** Matches an explicit timezone designator: "Z", "+05:30", "+0530", "-0800". */
const HAS_TZ_RE = /(Z|[+-]\d{2}:?\d{2})$/i;

/** Matches a datetime (as opposed to date-only) ISO string: "YYYY-MM-DD[T ]HH:mm…". */
const HAS_TIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/**
 * Parse an API timestamp into a Date. A string with no timezone designator is
 * treated as UTC (that is what the backend writes), so downstream
 * Asia/Kolkata formatting is correct regardless of the viewer's machine
 * timezone. Strings that already carry "Z" or a numeric offset — and
 * date-only strings, which the spec defines as UTC — pass through as-is.
 */
export function parseUtcIso(value: string): Date {
  let normalized = value.trim().replace(" ", "T");
  if (HAS_TIME_RE.test(normalized) && !HAS_TZ_RE.test(normalized)) {
    normalized += "Z";
  }
  return new Date(normalized);
}
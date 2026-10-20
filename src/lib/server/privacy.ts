/**
 * Privacy rules for everything the API returns.
 *
 * No raw phone numbers and no transcripts ever leave the backend. Phone numbers are shown
 * as their last four digits only. Transcripts are never read by any endpoint.
 */

/** "+917020547519" -> "+91 ••••••7519". Anything that is not a number -> null. */
export function maskPhone(phone: unknown): string | null {
  if (typeof phone !== "string") return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return null;
  const local = digits.slice(-10);
  return `+91 ${"•".repeat(Math.max(0, local.length - 4))}${local.slice(-4)}`;
}

// \p{Nd}, not \d: in JavaScript \d is ASCII only, and Marathi text often has Devanagari digits
const LONG_DIGITS = /\p{Nd}[\p{Nd}\s-]{7,}\p{Nd}/gu;

/**
 * Removes long digit runs (phone, Aadhaar, account numbers) from free text that came from
 * a caller or an officer note, as citizen_store/redact.py does before storage.
 */
export function scrubDigits(text: unknown): string | null {
  if (typeof text !== "string") return null;
  return text.replace(LONG_DIGITS, "[number removed]");
}

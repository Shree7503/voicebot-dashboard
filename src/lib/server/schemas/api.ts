import { z } from "zod";
import { CASE_STATUSES, PRIORITIES, VERDICTS } from "../categories";
import { OUTCOMES } from "../outcomes";

/** Request bodies and query parameters of the admin API. */

const note = z.string().trim().max(500, "Keep the note under 500 characters.");

export const LoginBody = z.strictObject({
  email: z.string().trim().min(1, "Enter your email.").max(200),
  password: z.string().min(1, "Enter the password.").max(200),
});

export const CaseActionBody = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("status"), status: z.enum(["acknowledged", "closed"]), note: note.default("") }),
  z.strictObject({ action: z.literal("verdict"), verdict: z.enum(VERDICTS), note: note.default("") }),
]);

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values).optional();
const isoDate = z.iso
  .datetime({ offset: true, message: "before must be an ISO timestamp from nextBefore." })
  .transform((value) => new Date(value))
  .optional();

export const CaseListQuery = z.object({
  status: optionalEnum(CASE_STATUSES),
  priority: optionalEnum(PRIORITIES),
  category: z.string().max(40).optional(),
  station: z.string().max(120).optional(),
  before: isoDate,
});

export const CallListQuery = z.object({
  channel: z.string().max(30).optional(),
  outcome: optionalEnum(OUTCOMES),
  language: z.string().max(30).optional(),
  before: isoDate,
});

export const AuditQuery = z.object({
  action: z.string().max(60).optional(),
  user: z.string().max(200).optional(),
  target: z.string().max(200).optional(),
  before: isoDate,
});

/** URLSearchParams -> object, dropping empty values, for the query schemas above. */
export function queryObject(params: URLSearchParams): Record<string, string> {
  return Object.fromEntries([...params.entries()].filter(([, value]) => value !== ""));
}

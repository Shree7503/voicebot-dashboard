import "server-only";

/**
 * Dashboard backend settings, read once from the environment. See .env.example.
 *
 * The dashboard reads the same MongoDB database the voice bot writes to (citizen_store and
 * case_store in the bot repo), and keeps its own data in `dash_*` collections next to it.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

export const env = {
  get mongoUri() {
    return required("MONGODB_URI");
  },
  /** Same default as the bot's CITIZEN_DB / CASE_DB. */
  get dbName() {
    return process.env.CITIZEN_DB || "voicebot";
  },
  /** Rough telephony + model cost per call minute, for the cost estimate. Unset: no estimate. */
  get costPerMinuteInr(): number | null {
    const raw = process.env.COST_PER_MINUTE_INR;
    return raw ? Number(raw) : null;
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
};

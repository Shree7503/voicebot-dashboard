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

export type DataEnv = "prod" | "test";

export const env = {
  get mongoUri() {
    return required("MONGODB_URI");
  },
  /** Same default as the bot's CITIZEN_DB / CASE_DB. */
  get dbName() {
    return process.env.CITIZEN_DB || "voicebot";
  },
  /** Which bot traffic the stats read by default; "test" is the browser test page. */
  get defaultDataEnv(): DataEnv {
    return process.env.DASHBOARD_DATA_ENV === "test" ? "test" : "prod";
  },
  /** Rough telephony + model cost per call minute, for the cost estimate. Unset: no estimate. */
  get costPerMinuteInr(): number | null {
    const raw = process.env.COST_PER_MINUTE_INR;
    return raw ? Number(raw) : null;
  },
  /** The bot's lost-and-found API (docs/bot-api-contract.md). Unset: the page says it isn't connected. */
  get lostFoundApiUrl(): string | null {
    return process.env.LOST_FOUND_API_URL?.replace(/\/+$/, "") || null;
  },
  get botApiToken(): string | null {
    return process.env.BOT_API_TOKEN || null;
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
};

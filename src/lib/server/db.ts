import "server-only";

import type { Collection, Db, Document } from "mongodb";
import mongoose, { type Mongoose } from "mongoose";
import { env, type DataEnv } from "./env";

/**
 * MongoDB access.
 *
 * Bot collections (written by the voice bot, read here) are prefixed "test_" for the browser
 * test page's traffic, exactly as citizen_store and case_store name them. Dashboard
 * collections are always prefixed "dash_" and are never written by the bot.
 */

export type BotCollection =
  | "citizens"
  | "transcripts"
  | "interactions"
  | "attribute_history"
  | "cases"
  | "case_events"
  | "alerts"
  | "incidents";

export const DASH = {
  audit: "dash_audit_log",
} as const;

// One connection per server process; kept on globalThis so dev hot reloads don't open more.
const globalForMongo = globalThis as unknown as { __rakshakMongo?: Promise<Mongoose> };

/**
 * The mongoose connection. The bot's collections have no fixed schema the dashboard owns, so
 * queries go through the native driver underneath it (mongoose and this code share the same
 * mongodb package).
 */
export function connectMongo(): Promise<Mongoose> {
  if (!globalForMongo.__rakshakMongo) {
    globalForMongo.__rakshakMongo = mongoose
      .connect(env.mongoUri, {
        dbName: env.dbName,
        serverSelectionTimeoutMS: 8000,
        maxPoolSize: 10,
        appName: "rakshak-dashboard",
        autoIndex: false,
        bufferCommands: false,
      })
      .catch((error) => {
        globalForMongo.__rakshakMongo = undefined; // retry on the next request
        throw error;
      });
  }
  return globalForMongo.__rakshakMongo;
}

export async function db(): Promise<Db> {
  const { connection } = await connectMongo();
  return connection.getClient().db(env.dbName);
}

export function botCollectionName(name: BotCollection, dataEnv: DataEnv): string {
  return dataEnv === "prod" ? name : `${dataEnv}_${name}`;
}

export async function botCol<T extends Document = Document>(
  name: BotCollection,
  dataEnv: DataEnv,
): Promise<Collection<T>> {
  return (await db()).collection<T>(botCollectionName(name, dataEnv));
}

export async function dashCol<T extends Document = Document>(
  name: (typeof DASH)[keyof typeof DASH],
): Promise<Collection<T>> {
  return (await db()).collection<T>(name);
}

let indexesReady: Promise<void> | undefined;

/** Indexes for the dashboard's own collections. Idempotent; runs once per process. */
export function ensureDashIndexes(): Promise<void> {
  indexesReady ??= (async () => {
    const database = await db();
    await database.collection(DASH.audit).createIndex({ at: -1 });
    await database.collection(DASH.audit).createIndex({ action: 1, at: -1 });
  })().catch((error) => {
    indexesReady = undefined;
    throw error;
  });
  return indexesReady;
}

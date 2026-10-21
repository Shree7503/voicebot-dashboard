import "server-only";

import type { Document, Filter } from "mongodb";
import { botCol } from "../db";
import { ApiError } from "../errors";
import { outcomeMatch, outcomeOf, type Outcome } from "../outcomes";
import { maskPhone } from "../privacy";
import type { DateRange } from "../schemas/query";
import type { Actor } from "../http";
import { audit } from "./audit";

/**
 * Calls (citizen_store interactions). Numbers are masked in every list; the full number and
 * the transcript are separate requests, and each one is written to the audit log.
 */

export interface CallQuery {
  range: DateRange;
  channel?: string;
  outcome?: Outcome;
  language?: string;
  before?: Date;
  limit: number;
}

function callRow(doc: Document) {
  return {
    id: doc._id,
    channel: doc.channel,
    agent: doc.agentId ?? null,
    caller: maskPhone(doc.citizenId),
    startedAt: doc.startedAt,
    durationSec: doc.durationSec ?? null,
    outcome: outcomeOf(doc),
    turns: { caller: doc.turnCounts?.citizen ?? 0, bot: doc.turnCounts?.agent ?? 0, tools: doc.turnCounts?.toolCalls ?? 0 },
    toolsUsed: doc.toolsUsed ?? [],
    language: doc.summary?.language ?? null,
    topics: doc.summary?.topics ?? [],
    clear: doc.summary?.clear ?? null,
    processing: doc.status,
    summary: doc.summary?.summary ?? null,
  };
}

export async function listCalls(query: CallQuery) {
  const interactions = await botCol("interactions");
  const filter: Filter<Document> = {
    startedAt: { $gte: query.range.from, $lt: query.before && query.before < query.range.to ? query.before : query.range.to },
  };
  if (query.channel) filter.channel = query.channel;
  if (query.language) filter["summary.language"] = query.language;
  if (query.outcome) Object.assign(filter, outcomeMatch(query.outcome));

  const docs = await interactions
    .find(filter, { projection: { summary: { summary: 1, language: 1, topics: 1, clear: 1 }, channel: 1, agentId: 1, citizenId: 1, startedAt: 1, durationSec: 1, turnCounts: 1, toolsUsed: 1, status: 1 } })
    .sort({ startedAt: -1 })
    .limit(query.limit + 1)
    .toArray();
  const page = docs.slice(0, query.limit);
  // emergencies and lost-and-found reports made in these calls, for their badges
  const cases = await (await botCol("cases"))
    .find({ interactionId: { $in: page.map((doc) => doc._id) } }, { projection: { _id: 1, type: 1, interactionId: 1, priority: 1 } })
    .toArray();
  return {
    items: page.map((doc) => ({
      ...callRow(doc),
      cases: cases.filter((c) => c.interactionId === doc._id).map((c) => ({ id: c._id, type: c.type, priority: c.priority })),
    })),
    nextBefore: docs.length > query.limit ? page[page.length - 1].startedAt.toISOString() : null,
  };
}

export async function getCall(id: string) {
  const interactions = await botCol("interactions");
  const doc = await interactions.findOne(
    { _id: id as unknown as Document["_id"] },
    { projection: { summary: { summary: 1, language: 1, topics: 1, clear: 1 }, channel: 1, agentId: 1, citizenId: 1, startedAt: 1, endedAt: 1, durationSec: 1, turnCounts: 1, toolsUsed: 1, status: 1, attempts: 1 } },
  );
  if (!doc) throw new ApiError(404, "not_found", `There is no call ${id}.`);
  const cases = await (await botCol("cases"))
    .find({ interactionId: id }, { projection: { _id: 1, type: 1, priority: 1, category: 1, status: 1 } })
    .toArray();
  return {
    ...callRow(doc),
    endedAt: doc.endedAt ?? null,
    summaryAttempts: doc.attempts ?? 0,
    cases: cases.map((c) => ({ id: c._id, type: c.type, priority: c.priority, category: c.category, status: c.status })),
  };
}

/** The caller's full number. Every reveal is audited. */
export async function revealCallCaller(actor: Actor, id: string) {
  const interactions = await botCol("interactions");
  const doc = await interactions.findOne({ _id: id as unknown as Document["_id"] }, { projection: { citizenId: 1 } });
  if (!doc) throw new ApiError(404, "not_found", `There is no call ${id}.`);
  await audit(actor, "call.caller.reveal", `call:${id}`, null, null);
  return { phone: doc.citizenId ?? null };
}

/**
 * The conversation, as citizen_store stored it (long numbers and OTP-like words already
 * removed from what the caller said). Tool calls show only the tool's name. Every view is audited.
 */
export async function getTranscript(actor: Actor, id: string) {
  const transcripts = await botCol("transcripts");
  const doc = await transcripts.findOne({ _id: id as unknown as Document["_id"] });
  await audit(actor, "call.transcript.view", `call:${id}`, null, null);
  if (!doc) return { available: false as const, turns: [] };
  const turns = (doc.turns ?? [])
    .map((turn: Document) => {
      if (turn.role === "user") return { speaker: "caller" as const, text: String(turn.text ?? "") };
      if (turn.role === "assistant") return { speaker: "bot" as const, text: String(turn.text ?? "") };
      if (turn.role === "tool_call" && turn.tool) return { speaker: "tool" as const, text: String(turn.tool) };
      return null;
    })
    .filter((turn: { text: string } | null) => turn && turn.text);
  return { available: true as const, expiresAt: doc.expiresAt ?? null, turns };
}

import "server-only";

import type { Document, Filter } from "mongodb";
import { CASE_STATUSES, categoryLabel, PRIORITIES } from "../categories";
import { botCol } from "../db";
import type { DataEnv } from "../env";
import { ApiError } from "../errors";
import type { Actor } from "../http";
import { maskPhone, scrubDigits } from "../privacy";
import type { DateRange } from "../schemas/query";
import { audit } from "./audit";

/**
 * Emergency cases from case_store. Every response is built field by field from an allow-list:
 * the caller's number is masked, incident phone lists and alert recipients are never returned,
 * and the linked transcript is never read.
 */

export interface CaseQuery {
  range: DateRange;
  status?: (typeof CASE_STATUSES)[number];
  priority?: (typeof PRIORITIES)[number];
  category?: string;
  station?: string;
  /** createdAt of the last row of the previous page */
  before?: Date;
  limit: number;
}

function caseSummary(doc: Document) {
  return {
    id: doc._id,
    type: doc.type,
    category: categoryLabel(doc.category),
    priority: doc.priority,
    priorityReason: doc.priorityReason ?? null,
    status: doc.status,
    channel: doc.channel ?? null,
    station: doc.station?.name ?? null,
    // what happened: the after-call details if assessed, else what the bot recorded during the call
    summary: scrubDigits(doc.details?.detailsMr || doc.description?.mr || doc.description?.asGiven) || null,
    place: doc.location?.english || doc.location?.spoken || doc.details?.placeEnglish || null,
    caller: maskPhone(doc.citizen?.phone),
    callId: doc.interactionId ?? null,
    credibility: doc.credibility?.level ?? null,
    verdict: doc.verdict?.value ?? null,
    incidentId: doc.incidentId ?? null,
    recordedBy: doc.recordedBy ?? null,
    createdAt: doc.createdAt,
    alertedAt: doc.alertedAt ?? null,
    acknowledgedAt: doc.acknowledgedAt ?? null,
    closedAt: doc.closedAt ?? null,
  };
}

export async function listCases(dataEnv: DataEnv, query: CaseQuery) {
  const cases = await botCol("cases", dataEnv);
  const filter: Filter<Document> = {
    type: "emergency",
    createdAt: { $gte: query.range.from, $lt: query.before && query.before < query.range.to ? query.before : query.range.to },
  };
  if (query.status) filter.status = query.status;
  if (query.priority) filter.priority = query.priority;
  if (query.category) filter.category = query.category;
  if (query.station) filter["station.name"] = query.station;

  const docs = await cases.find(filter).sort({ createdAt: -1 }).limit(query.limit + 1).toArray();
  const page = docs.slice(0, query.limit);
  return {
    items: page.map(caseSummary),
    nextBefore: docs.length > query.limit ? page[page.length - 1].createdAt.toISOString() : null,
  };
}

/** Event data that is safe to show: officer notes are scrubbed of long numbers. */
function eventData(kind: string, data: Document | undefined) {
  if (!data) return {};
  const safe: Document = {};
  for (const key of ["priority", "category", "station", "recordedBy", "value", "status", "count", "credibility", "title"]) {
    if (data[key] !== undefined) safe[key] = key === "credibility" ? { level: data[key]?.level, score: data[key]?.score } : data[key];
  }
  if (typeof data.note === "string") safe.note = scrubDigits(data.note);
  if (kind.startsWith("alert") && typeof data.error === "string") safe.error = data.error.slice(0, 200);
  return safe;
}

export async function getCase(dataEnv: DataEnv, id: string) {
  const cases = await botCol("cases", dataEnv);
  const doc = await cases.findOne({ _id: id as unknown as Document["_id"] });
  if (!doc || doc.type !== "emergency") throw new ApiError(404, "not_found", `There is no case ${id}.`);

  const [events, alerts] = await Promise.all([
    (await botCol("case_events", dataEnv)).find({ caseId: id }).sort({ at: 1 }).limit(500).toArray(),
    (await botCol("alerts", dataEnv))
      .find({ caseId: id }, { projection: { kind: 1, status: 1, attempts: 1, createdAt: 1, sentAt: 1, sentTemplate: 1, lastError: 1 } })
      .sort({ createdAt: 1 })
      .toArray(),
  ]);
  const incident = doc.incidentId
    ? await (await botCol("incidents", dataEnv)).findOne(
        { _id: doc.incidentId },
        { projection: { caseIds: 1, count: 1, firstAt: 1, lastAt: 1, family: 1, area: 1 } },
      )
    : null;

  return {
    ...caseSummary(doc),
    location: { spoken: doc.location?.spoken ?? null, english: doc.location?.english ?? null },
    station: doc.station ? { name: doc.station.name ?? null, phone: doc.station.phone ?? null } : null,
    flags: doc.flags ?? {},
    description: {
      mr: scrubDigits(doc.description?.mr),
      asGiven: scrubDigits(doc.description?.asGiven),
    },
    details: doc.details
      ? {
          detailsMr: scrubDigits(doc.details.detailsMr),
          injuredDetail: doc.details.injuredDetail ?? null,
          weaponDetail: doc.details.weaponDetail ?? null,
          place: doc.details.place ?? null,
          placeEnglish: doc.details.placeEnglish ?? null,
        }
      : null,
    credibility: doc.credibility
      ? { level: doc.credibility.level ?? null, score: doc.credibility.score ?? null, reasons: doc.credibility.reasons ?? [] }
      : null,
    verdict: doc.verdict ? { value: doc.verdict.value, by: doc.verdict.by, at: doc.verdict.at, note: scrubDigits(doc.verdict.note) } : null,
    assessment: { status: doc.assessment?.status ?? null },
    incident: incident
      ? {
          id: incident._id,
          reports: incident.count ?? incident.caseIds?.length ?? 1,
          caseIds: incident.caseIds ?? [],
          firstAt: incident.firstAt,
          lastAt: incident.lastAt,
        }
      : null,
    alerts: alerts.map((alert) => ({
      id: alert._id,
      kind: alert.kind,
      status: alert.status,
      attempts: alert.attempts ?? 0,
      template: alert.sentTemplate ?? null,
      createdAt: alert.createdAt,
      sentAt: alert.sentAt ?? null,
      lastError: typeof alert.lastError === "string" ? alert.lastError.slice(0, 200) : null,
    })),
    timeline: events.map((event) => ({ kind: event.kind, at: event.at, by: event.by ?? "system", data: eventData(event.kind, event.data) })),
  };
}

export type CaseAction =
  | { action: "status"; status: "acknowledged" | "closed"; note: string }
  | { action: "verdict"; verdict: "genuine" | "hoax" | "unverifiable"; note: string };

/**
 * The same writes as CaseStore.set_status / set_verdict in the bot (case_store/store.py),
 * including the case_events entry, so the bot's CLI and the dashboard show one timeline.
 */
export async function actOnCase(dataEnv: DataEnv, actor: Actor, id: string, change: CaseAction) {
  const cases = await botCol("cases", dataEnv);
  const before = await cases.findOne({ _id: id as unknown as Document["_id"] });
  if (!before || before.type !== "emergency") throw new ApiError(404, "not_found", `There is no case ${id}.`);
  const now = new Date();
  const by = actor.name;

  if (change.action === "status") {
    if (before.status === "closed" && change.status === "acknowledged") {
      throw new ApiError(409, "closed", `${id} is already closed.`);
    }
    const stamp = change.status === "acknowledged" ? "acknowledgedAt" : "closedAt";
    await cases.updateOne({ _id: before._id }, { $set: { status: change.status, [stamp]: now, updatedAt: now } });
    await (await botCol("case_events", dataEnv)).insertOne({ caseId: id, kind: change.status, at: now, by, data: { note: change.note } });
    await audit(actor, `case.${change.status}`, `case:${dataEnv}:${id}`, { status: before.status }, { status: change.status }, change.note);
  } else {
    const verdict = { value: change.verdict, by, note: change.note, at: now };
    await cases.updateOne({ _id: before._id }, { $set: { verdict, updatedAt: now } });
    await (await botCol("case_events", dataEnv)).insertOne({ caseId: id, kind: "verdict", at: now, by, data: { value: change.verdict, note: change.note } });
    await audit(actor, "case.verdict", `case:${dataEnv}:${id}`, { verdict: before.verdict?.value ?? null }, { verdict: change.verdict }, change.note);
  }
  return getCase(dataEnv, id);
}

/** The caller's full number, for the control room to call back. Every reveal is audited. */
export async function revealCaseCaller(dataEnv: DataEnv, actor: Actor, id: string) {
  const cases = await botCol("cases", dataEnv);
  const doc = await cases.findOne({ _id: id as unknown as Document["_id"] }, { projection: { type: 1, "citizen.phone": 1 } });
  if (!doc || doc.type !== "emergency") throw new ApiError(404, "not_found", `There is no case ${id}.`);
  await audit(actor, "case.caller.reveal", `case:${dataEnv}:${id}`, null, null);
  return { phone: doc.citizen?.phone ?? null };
}

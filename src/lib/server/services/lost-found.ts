import "server-only";

import type { Document } from "mongodb";
import { botCol } from "../db";
import { ApiError } from "../errors";
import type { Actor } from "../http";
import { maskPhone, scrubDigits } from "../privacy";
import { audit } from "./audit";
import { daysIn, IST_TZ, type DateRange } from "../schemas/query";

/**
 * Lost and found, read from the bot's own records: `cases` with `type: "lost_found"`
 * (references L-… for lost items, F-… for found ones) and the `match_suggested` events the
 * bot writes when a lost and a found report look like the same item.
 *
 * Lists and figures carry no item details. One report's page shows its details and its call;
 * the caller's number stays masked until revealed, and each reveal is audited. The phone number
 * and IMEI written on an item are never read.
 */

export const KINDS = ["lost", "found"] as const;
export type Kind = (typeof KINDS)[number];

const LOST_FOUND = { type: "lost_found" };
const dayExpr = (field: string) => ({ $dateToString: { format: "%Y-%m-%d", date: field, timezone: IST_TZ } });

/** A report still waiting: its own state is open and the case isn't closed. */
const OPEN = { "lostFound.state": "open", status: { $ne: "closed" } };

interface MatchEvent {
  caseId: string;
  at: Date;
  data?: { lost?: string; found?: string; score?: number; strong?: boolean };
}

/** Suggested matches, one per lost/found pair (the bot logs each on both reports). */
async function suggestedMatches(filter: Document = {}) {
  const events = await (await botCol("case_events"))
    .find({ kind: "match_suggested", ...filter }, { projection: { _id: 0, caseId: 1, at: 1, data: 1 } })
    .toArray();
  const pairs = new Map<string, { lost: string; found: string; score: number | null; strong: boolean; at: Date }>();
  for (const event of events as unknown as MatchEvent[]) {
    const { lost, found } = event.data ?? {};
    if (!lost || !found) continue;
    const key = `${lost}|${found}`;
    const existing = pairs.get(key);
    if (!existing || event.at > existing.at) {
      pairs.set(key, {
        lost,
        found,
        score: typeof event.data?.score === "number" ? event.data.score : null,
        strong: event.data?.strong === true,
        at: event.at,
      });
    }
  }
  return [...pairs.values()];
}

export async function lostFoundStats(range: DateRange) {
  const cases = await botCol("cases");
  const [facet] = await cases
    .aggregate<Document>([
      { $match: LOST_FOUND },
      {
        $facet: {
          perDay: [
            { $match: { createdAt: { $gte: range.from, $lt: range.to } } },
            { $group: { _id: { day: dayExpr("$createdAt"), kind: "$lostFound.kind" }, n: { $sum: 1 } } },
          ],
          // waiting now, whenever they were reported
          open: [{ $match: OPEN }, { $group: { _id: "$lostFound.kind", n: { $sum: 1 } } }],
          resolved: [{ $match: { $nor: [OPEN] } }, { $count: "n" }],
        },
      },
    ])
    .toArray();

  const days = new Map(daysIn(range).map((day) => [day, { day, lost: 0, found: 0 }]));
  for (const row of facet.perDay) {
    const entry = days.get(row._id.day);
    if (entry && (row._id.kind === "lost" || row._id.kind === "found")) entry[row._id.kind as Kind] += row.n;
  }
  const open = { lost: 0, found: 0 };
  for (const row of facet.open) if (row._id === "lost" || row._id === "found") open[row._id as Kind] = row.n;

  // matches between reports that are both still open: the ones someone should check
  const openIds = new Set(
    (await cases.find({ ...LOST_FOUND, ...OPEN }, { projection: { _id: 1 } }).toArray()).map((d) => String(d._id)),
  );
  const pending = (await suggestedMatches()).filter((m) => openIds.has(m.lost) && openIds.has(m.found));

  const perDay = [...days.values()];
  return {
    range: { from: range.fromDay, to: range.toDay, timezone: IST_TZ },
    reported: {
      lost: perDay.reduce((sum, d) => sum + d.lost, 0),
      found: perDay.reduce((sum, d) => sum + d.found, 0),
    },
    open,
    matchesToCheck: pending.length,
    strongMatchesToCheck: pending.filter((m) => m.strong).length,
    resolved: facet.resolved[0]?.n ?? 0,
    perDay,
  };
}

export interface LostFoundQuery {
  range: DateRange;
  kind?: Kind;
  open?: boolean;
  before?: Date;
  limit: number;
}

/** Reports as reference, lost or found, item type, status, match, station and dates. */
export async function lostFoundList(query: LostFoundQuery) {
  const cases = await botCol("cases");
  const filter: Document = {
    ...LOST_FOUND,
    createdAt: { $gte: query.range.from, $lt: query.before && query.before < query.range.to ? query.before : query.range.to },
  };
  if (query.kind) filter["lostFound.kind"] = query.kind;
  if (query.open !== undefined) Object.assign(filter, query.open ? OPEN : { $nor: [OPEN] });

  const docs = await cases
    .find(filter, {
      // an allow-list: nothing that identifies the item or the caller is read at all
      projection: { _id: 1, status: 1, createdAt: 1, updatedAt: 1, category: 1, "station.name": 1, "lostFound.kind": 1, "lostFound.state": 1, "lostFound.group": 1 },
    })
    .sort({ createdAt: -1 })
    .limit(query.limit + 1)
    .toArray();
  const page = docs.slice(0, query.limit);
  const ids = page.map((d) => String(d._id));
  const matches = await suggestedMatches({ caseId: { $in: ids } });

  return {
    items: page.map((doc) => {
      const id = String(doc._id);
      const kind: Kind | null = doc.lostFound?.kind === "lost" || doc.lostFound?.kind === "found" ? doc.lostFound.kind : null;
      const best = matches
        .filter((m) => m.lost === id || m.found === id)
        .sort((a, b) => Number(b.strong) - Number(a.strong) || (b.score ?? 0) - (a.score ?? 0))[0];
      return {
        id,
        kind,
        item: doc.lostFound?.group ?? doc.category ?? null,
        state: doc.lostFound?.state ?? null,
        caseStatus: doc.status ?? null,
        station: doc.station?.name ?? null,
        match: best ? { with: best.lost === id ? best.found : best.lost, score: best.score, strong: best.strong } : null,
        reportedAt: doc.createdAt,
        updatedAt: doc.updatedAt ?? null,
      };
    }),
    nextBefore: docs.length > query.limit ? page[page.length - 1].createdAt.toISOString() : null,
  };
}

// ------------------------------------------------------------------ one report

/** A timeline step in plain words. Event data that carries item details is not passed on. */
function describeEvent(kind: string, data: Document | undefined): string {
  switch (kind) {
    case "created":
      return "Reported to the bot";
    case "detail_added":
      return "More details added during the call";
    case "match_suggested":
      return `Possible match suggested: ${data?.lost && data?.found ? `${data.lost} and ${data.found}` : "another report"}${
        typeof data?.score === "number" ? ` (score ${data.score}${data.strong ? ", strong" : ""})` : ""
      }`;
    case "alert_queued":
      return "WhatsApp alert queued";
    case "alert_sent":
      return "WhatsApp alert sent to the control room";
    case "alert_failed":
      return "WhatsApp alert failed";
    case "caller_message_queued":
      return "WhatsApp message to the caller queued";
    case "caller_message_sent":
      return "WhatsApp message sent to the caller";
    case "closed":
      return data?.reason === "returned" ? `Returned to the owner${data?.note ? `: ${data.note}` : ""}` : `Closed${data?.note ? `: ${data.note}` : ""}`;
    default:
      return kind.replace(/_/g, " ");
  }
}

async function findReport(id: string) {
  const doc = await (await botCol("cases")).findOne({ _id: id as unknown as Document["_id"], ...LOST_FOUND });
  if (!doc) throw new ApiError(404, "not_found", `There is no lost-and-found report ${id}.`);
  return doc;
}

/** Everything about one report, for the detail page. The caller's number stays masked. */
export async function getLostFound(id: string) {
  const doc = await findReport(id);
  const [events, matches, call] = await Promise.all([
    (await botCol("case_events")).find({ caseId: id }).sort({ at: 1 }).limit(500).toArray(),
    suggestedMatches({ caseId: id }),
    doc.interactionId
      ? (await botCol("interactions")).findOne(
          { _id: doc.interactionId },
          { projection: { channel: 1, startedAt: 1, durationSec: 1, turnCounts: 1, "summary.summary": 1, "summary.language": 1, status: 1 } },
        )
      : null,
  ]);
  const others = await (await botCol("cases"))
    .find({ _id: { $in: matches.map((m) => (m.lost === id ? m.found : m.lost)) as unknown as Document["_id"][] } }, { projection: { _id: 1, status: 1, "lostFound.state": 1, "lostFound.item": 1, "lostFound.group": 1 } })
    .toArray();
  const lf = doc.lostFound ?? {};

  return {
    id,
    kind: lf.kind === "lost" || lf.kind === "found" ? (lf.kind as Kind) : null,
    state: lf.state ?? null,
    caseStatus: doc.status ?? null,
    open: lf.state === "open" && doc.status !== "closed",
    item: {
      name: lf.item ?? null,
      group: lf.group ?? doc.category ?? null,
      brand: lf.brand ?? null,
      colour: lf.colour ?? null,
      marks: scrubDigits(lf.marks),
      nameOnItem: lf.nameOnItem ?? null,
      when: lf.when ?? null,
    },
    description: { mr: scrubDigits(doc.description?.mr), asGiven: scrubDigits(doc.description?.asGiven) },
    place: { spoken: doc.location?.spoken ?? null, english: doc.location?.english ?? null },
    station: doc.station ? { name: doc.station.name ?? null, phone: doc.station.phone ?? null, officer: doc.station.officer ?? null } : null,
    caller: maskPhone(doc.citizen?.phone),
    matches: matches.map((m) => {
      const otherId = m.lost === id ? m.found : m.lost;
      const other = others.find((o) => String(o._id) === otherId);
      return {
        id: otherId,
        score: m.score,
        strong: m.strong,
        item: other?.lostFound?.item ?? null,
        open: other ? other.lostFound?.state === "open" && other.status !== "closed" : null,
      };
    }),
    call: call
      ? {
          id: String(call._id),
          channel: call.channel ?? null,
          startedAt: call.startedAt,
          durationSec: call.durationSec ?? null,
          language: call.summary?.language ?? null,
          summary: call.summary?.summary ?? null,
          processing: call.status ?? null,
        }
      : null,
    closed: doc.closedAt ? { at: doc.closedAt, by: doc.closedBy ?? null, reason: lf.state ?? null, note: scrubDigits(doc.closeNote) } : null,
    reportedAt: doc.createdAt,
    updatedAt: doc.updatedAt ?? null,
    timeline: events.map((e) => ({ kind: e.kind, at: e.at, by: e.by ?? "system", text: describeEvent(e.kind, e.data) })),
  };
}

export const CLOSE_REASONS = ["returned", "closed"] as const;

/**
 * Closes a report: `returned` when the item is back with its owner, `closed` for any other
 * reason. Sets the bot's own fields (status, lostFound.state) and writes a case_events entry,
 * as the bot's staff commands do, so the bot sees the same thing. Optionally closes the matched
 * report too.
 */
export async function closeLostFound(
  actor: Actor,
  id: string,
  change: { reason: (typeof CLOSE_REASONS)[number]; note: string; alsoClose?: string },
) {
  const ids = [id];
  if (change.alsoClose) {
    const pair = (await suggestedMatches({ caseId: id })).some((m) => (m.lost === id ? m.found : m.lost) === change.alsoClose);
    if (!pair) throw new ApiError(422, "not_a_match", `${change.alsoClose} is not a suggested match for ${id}.`);
    ids.push(change.alsoClose);
  }
  const cases = await botCol("cases");
  const events = await botCol("case_events");
  for (const caseId of ids) {
    const before = await findReport(caseId);
    if (before.status === "closed" || before.lostFound?.state !== "open") {
      if (caseId === id) throw new ApiError(409, "already_closed", `${caseId} is already closed.`);
      continue; // the matched report was closed already: nothing to do
    }
    const now = new Date();
    await cases.updateOne(
      { _id: before._id },
      { $set: { status: "closed", "lostFound.state": change.reason, closedAt: now, closedBy: actor.name, closeNote: change.note, updatedAt: now } },
    );
    await events.insertOne({
      caseId,
      kind: "closed",
      at: now,
      by: actor.name,
      data: { reason: change.reason, note: change.note, ...(caseId !== id ? { with: id } : {}) },
    });
    await audit(actor, "lost_found.close", `case:${caseId}`, { status: before.status, state: before.lostFound?.state ?? null }, { status: "closed", state: change.reason }, change.note);
  }
  return getLostFound(id);
}

/** The caller's full number. Every reveal is audited. */
export async function revealLostFoundCaller(actor: Actor, id: string) {
  const doc = await findReport(id);
  await audit(actor, "lost_found.caller.reveal", `case:${id}`, null, null);
  return { phone: doc.citizen?.phone ?? null };
}

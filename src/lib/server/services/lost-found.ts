import "server-only";

import type { Document } from "mongodb";
import { botCol } from "../db";
import { daysIn, IST_TZ, type DateRange } from "../schemas/query";

/**
 * Lost and found, read from the bot's own records: `cases` with `type: "lost_found"`
 * (references L-… for lost items, F-… for found ones) and the `match_suggested` events the
 * bot writes when a lost and a found report look like the same item.
 *
 * Figures and status only. What identifies an item or a person (brand, colour, marks, IMEI,
 * the phone number on the item, the description, the caller's number) is never read.
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

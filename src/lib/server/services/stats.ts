import "server-only";

import type { Document } from "mongodb";
import { categoryLabel } from "../categories";
import { botCol } from "../db";
import { env, type DataEnv } from "../env";
import { OUTCOMES, outcomeExpr } from "../outcomes";
import { daysIn, IST_TZ, type DateRange } from "../schemas/query";

/**
 * Aggregate statistics. Nothing here returns a phone number, a transcript, a summary
 * sentence or any per-call row: only counts, rates and durations.
 *
 * Needs MongoDB 7.0+ ($percentile).
 */

const dayExpr = (field: string) => ({ $dateToString: { format: "%Y-%m-%d", date: field, timezone: IST_TZ } });
const pct = (field: string, p: number[]) => ({ $percentile: { input: field, p, method: "approximate" } });
const round = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined ? null : Math.round(value * 10 ** digits) / 10 ** digits;

function inRange(field: string, range: DateRange) {
  return { [field]: { $gte: range.from, $lt: range.to } };
}

function counts(rows: { _id: unknown; n: number }[]) {
  return rows.map((row) => ({ key: row._id ?? "unknown", count: row.n }));
}

function rate(part: number, whole: number) {
  return whole ? round(part / whole, 3) : null;
}

/** Metrics the plan asks for that the bot does not record yet. */
const NOT_RECORDED = {
  stageLatency: "Gemini Live does speech-to-text, reply and voice in one model; per-stage timings are not recorded.",
  fallbackRate: "The bot does not log fallbacks yet.",
  liveCalls: "The bot does not publish its live call count yet.",
  sttConfidence: "Speech confidence is not recorded; `clearRate` (the summariser judged the caller's words coherent) is the closest signal.",
};

// ------------------------------------------------------------------ overview

export async function overview(dataEnv: DataEnv, range: DateRange) {
  const interactions = await botCol("interactions", dataEnv);
  const cases = await botCol("cases", dataEnv);

  const [facet] = await interactions
    .aggregate<Document>([
      { $match: inRange("startedAt", range) },
      { $addFields: { outcome: outcomeExpr, day: dayExpr("$startedAt") } },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                calls: { $sum: 1 },
                seconds: { $sum: { $ifNull: ["$durationSec", 0] } },
                avg: { $avg: "$durationSec" },
                p: pct("$durationSec", [0.5, 0.95]),
                callers: { $addToSet: "$citizenId" },
              },
            },
            { $project: { _id: 0, calls: 1, seconds: 1, avg: 1, p: 1, callers: { $size: "$callers" } } },
          ],
          outcomes: [{ $group: { _id: "$outcome", n: { $sum: 1 } } }],
          perDay: [{ $group: { _id: { day: "$day", outcome: "$outcome" }, n: { $sum: 1 }, seconds: { $sum: { $ifNull: ["$durationSec", 0] } } } }],
          perHour: [
            { $group: { _id: { $hour: { date: "$startedAt", timezone: IST_TZ } }, n: { $sum: 1 } } },
            { $sort: { _id: 1 } },
          ],
          channels: [{ $group: { _id: "$channel", n: { $sum: 1 } } }, { $sort: { n: -1 } }],
          processing: [{ $group: { _id: "$status", n: { $sum: 1 } } }],
        },
      },
    ])
    .toArray();

  const emergencies = await cases
    .aggregate<{ _id: { day: string; priority: string }; n: number }>([
      { $match: { type: "emergency", ...inRange("createdAt", range) } },
      { $group: { _id: { day: dayExpr("$createdAt"), priority: "$priority" }, n: { $sum: 1 } } },
    ])
    .toArray();

  // WhatsApp alerts that reached WhatsApp (case_store's outbox), by the day they were sent
  const alertsSent = await (await botCol("alerts", dataEnv))
    .aggregate<{ _id: string; n: number }>([
      { $match: { status: "sent", sentAt: { $gte: range.from, $lt: range.to } } },
      { $group: { _id: dayExpr("$sentAt"), n: { $sum: 1 } } },
    ])
    .toArray();

  const totals = facet.totals[0] ?? { calls: 0, seconds: 0, avg: null, p: [null, null], callers: 0 };
  const outcomes = Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<(typeof OUTCOMES)[number], number>;
  for (const row of facet.outcomes) outcomes[row._id as keyof typeof outcomes] = row.n;

  const days = new Map(
    daysIn(range).map((day) => [day, { day, calls: 0, minutes: 0, completed: 0, short: 0, noSpeech: 0, emergencies: 0, p1: 0, alertsSent: 0 }]),
  );
  for (const row of facet.perDay) {
    const entry = days.get(row._id.day);
    if (!entry) continue;
    entry.calls += row.n;
    entry.minutes = round(entry.minutes + row.seconds / 60) ?? 0;
    if (row._id.outcome === "completed") entry.completed += row.n;
    if (row._id.outcome === "short") entry.short += row.n;
    if (row._id.outcome === "no_speech") entry.noSpeech += row.n;
  }
  let emergencyTotal = 0;
  let p1Total = 0;
  for (const row of emergencies) {
    emergencyTotal += row.n;
    if (row._id.priority === "P1") p1Total += row.n;
    const entry = days.get(row._id.day);
    if (!entry) continue;
    entry.emergencies += row.n;
    if (row._id.priority === "P1") entry.p1 += row.n;
  }

  let alertTotal = 0;
  for (const row of alertsSent) {
    alertTotal += row.n;
    const entry = days.get(row._id);
    if (entry) entry.alertsSent += row.n;
  }

  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, calls: 0 }));
  for (const row of facet.perHour) hours[row._id].calls = row.n;

  const minutes = totals.seconds / 60;
  const perMinute = env.costPerMinuteInr;
  const processing = Object.fromEntries(counts(facet.processing).map((r) => [r.key, r.count]));

  return {
    dataEnv,
    range: { from: range.fromDay, to: range.toDay, timezone: IST_TZ },
    totals: {
      calls: totals.calls,
      uniqueCallers: totals.callers,
      totalMinutes: round(minutes),
      avgDurationSec: round(totals.avg),
      medianDurationSec: round(totals.p?.[0]),
      p95DurationSec: round(totals.p?.[1]),
      outcomes,
      completionRate: rate(outcomes.completed, totals.calls),
      emergencies: emergencyTotal,
      emergenciesP1: p1Total,
      alertsSent: alertTotal,
    },
    perDay: [...days.values()],
    perHour: hours,
    channels: counts(facet.channels),
    // calls whose after-call summary is still waiting or failed (the bot retries them)
    processing: { pending: (processing.pending ?? 0) + (processing.processing ?? 0), failed: processing.failed ?? 0 },
    cost:
      perMinute === null
        ? null
        : {
            perMinuteInr: perMinute,
            totalInr: round(minutes * perMinute, 2),
            perCallInr: totals.calls ? round((minutes * perMinute) / totals.calls, 2) : null,
          },
    notRecorded: { stageLatency: NOT_RECORDED.stageLatency, fallbackRate: NOT_RECORDED.fallbackRate, liveCalls: NOT_RECORDED.liveCalls },
  };
}

// ------------------------------------------------------------------ languages

export async function languages(dataEnv: DataEnv, range: DateRange) {
  const interactions = await botCol("interactions", dataEnv);
  const rows = await interactions
    .aggregate<Document>([
      { $match: inRange("startedAt", range) },
      {
        $addFields: {
          language: { $toLower: { $ifNull: ["$summary.language", "unknown"] } },
          outcome: outcomeExpr,
        },
      },
      {
        $group: {
          _id: "$language",
          calls: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ["$outcome", "completed"] }, 1, 0] } },
          summarised: { $sum: { $cond: [{ $eq: ["$status", "summarised"] }, 1, 0] } },
          clear: { $sum: { $cond: [{ $eq: ["$summary.clear", true] }, 1, 0] } },
          avg: { $avg: "$durationSec" },
          p: pct("$durationSec", [0.5]),
        },
      },
      { $sort: { calls: -1 } },
    ])
    .toArray();

  const total = rows.reduce((sum, row) => sum + row.calls, 0);
  return {
    dataEnv,
    range: { from: range.fromDay, to: range.toDay, timezone: IST_TZ },
    total,
    languages: rows.map((row) => ({
      language: row._id,
      calls: row.calls,
      share: rate(row.calls, total),
      completionRate: rate(row.completed, row.calls),
      // of the calls already summarised, how many the summariser judged coherent
      clearRate: rate(row.clear, row.summarised),
      avgDurationSec: round(row.avg),
      medianDurationSec: round(row.p?.[0]),
    })),
    notRecorded: { sttConfidence: NOT_RECORDED.sttConfidence },
  };
}

// ------------------------------------------------------------------ outcomes (cases and topics)

export async function outcomes(dataEnv: DataEnv, range: DateRange) {
  const cases = await botCol("cases", dataEnv);
  const alerts = await botCol("alerts", dataEnv);
  const interactions = await botCol("interactions", dataEnv);

  const [caseFacet] = await cases
    .aggregate<Document>([
      { $match: { type: "emergency", ...inRange("createdAt", range) } },
      {
        $facet: {
          category: [{ $group: { _id: "$category", n: { $sum: 1 } } }, { $sort: { n: -1 } }],
          priority: [{ $group: { _id: "$priority", n: { $sum: 1 } } }, { $sort: { _id: 1 } }],
          status: [{ $group: { _id: "$status", n: { $sum: 1 } } }],
          verdict: [{ $group: { _id: { $ifNull: ["$verdict.value", "none"] }, n: { $sum: 1 } } }],
          credibility: [{ $group: { _id: { $ifNull: ["$credibility.level", "not_assessed"] }, n: { $sum: 1 } } }],
          station: [
            { $group: { _id: { $ifNull: ["$station.name", "not found"] }, n: { $sum: 1 } } },
            { $sort: { n: -1 } },
            { $limit: 15 },
          ],
          recordedBy: [{ $group: { _id: "$recordedBy", n: { $sum: 1 } } }],
          incidents: [{ $match: { incidentId: { $ne: null } } }, { $group: { _id: "$incidentId" } }, { $count: "n" }],
          ackMinutes: [
            { $match: { acknowledgedAt: { $type: "date" } } },
            { $project: { m: { $divide: [{ $subtract: ["$acknowledgedAt", "$createdAt"] }, 60000] } } },
            { $group: { _id: null, p: pct("$m", [0.5, 0.95]), n: { $sum: 1 } } },
          ],
        },
      },
    ])
    .toArray();

  const alertRows = await alerts
    .aggregate<{ _id: { kind: string; status: string }; n: number }>([
      { $match: inRange("createdAt", range) },
      { $group: { _id: { kind: "$kind", status: "$status" }, n: { $sum: 1 } } },
    ])
    .toArray();

  const [topicFacet] = await interactions
    .aggregate<Document>([
      { $match: inRange("startedAt", range) },
      {
        $facet: {
          topics: [
            { $unwind: "$summary.topics" },
            { $group: { _id: { $toLower: "$summary.topics" }, n: { $sum: 1 } } },
            { $sort: { n: -1 } },
            { $limit: 20 },
          ],
          tools: [{ $unwind: "$toolsUsed" }, { $group: { _id: "$toolsUsed", n: { $sum: 1 } } }, { $sort: { n: -1 } }],
        },
      },
    ])
    .toArray();

  const ack = caseFacet.ackMinutes[0];
  return {
    dataEnv,
    range: { from: range.fromDay, to: range.toDay, timezone: IST_TZ },
    emergencies: {
      total: caseFacet.priority.reduce((sum: number, row: { n: number }) => sum + row.n, 0),
      incidents: caseFacet.incidents[0]?.n ?? 0,
      byCategory: caseFacet.category.map((row: { _id: string; n: number }) => ({ ...categoryLabel(row._id), count: row.n })),
      byPriority: counts(caseFacet.priority),
      byStatus: counts(caseFacet.status),
      byVerdict: counts(caseFacet.verdict),
      byCredibility: counts(caseFacet.credibility),
      byStation: counts(caseFacet.station),
      // "bot": the voice model reported it; "auto_*": the safety net caught one it missed
      byRecordedBy: counts(caseFacet.recordedBy),
      acknowledgeMinutes: ack ? { count: ack.n, median: round(ack.p[0]), p95: round(ack.p[1]) } : null,
    },
    alerts: alertRows.map((row) => ({ kind: row._id.kind, status: row._id.status, count: row.n })),
    topics: counts(topicFacet.topics),
    toolsUsed: counts(topicFacet.tools),
  };
}

// ------------------------------------------------------------------ timing

const DURATION_BUCKETS = [0, 15, 30, 60, 120, 300];

export async function timing(dataEnv: DataEnv, range: DateRange) {
  const interactions = await botCol("interactions", dataEnv);
  const alerts = await botCol("alerts", dataEnv);

  const [facet] = await interactions
    .aggregate<Document>([
      { $match: inRange("startedAt", range) },
      {
        $facet: {
          byChannel: [
            {
              $group: {
                _id: "$channel",
                calls: { $sum: 1 },
                p: pct("$durationSec", [0.5, 0.95]),
                turns: pct("$turnCounts.citizen", [0.5]),
              },
            },
            { $sort: { calls: -1 } },
          ],
          buckets: [
            {
              $bucket: {
                groupBy: { $ifNull: ["$durationSec", 0] },
                boundaries: DURATION_BUCKETS,
                default: "300+",
                output: { n: { $sum: 1 } },
              },
            },
          ],
          // after-call summary: how long until the caller's profile is updated
          summaryLagSec: [
            { $match: { summarisedAt: { $type: "date" }, endedAt: { $type: "date" } } },
            { $project: { s: { $divide: [{ $subtract: ["$summarisedAt", "$endedAt"] }, 1000] } } },
            { $group: { _id: null, p: pct("$s", [0.5, 0.95]), n: { $sum: 1 } } },
          ],
        },
      },
    ])
    .toArray();

  // emergency alert: from the case being recorded to WhatsApp accepting the message
  const [alertDelay] = await alerts
    .aggregate<Document>([
      { $match: { kind: "alert", status: "sent", sentAt: { $type: "date" }, ...inRange("createdAt", range) } },
      { $project: { s: { $divide: [{ $subtract: ["$sentAt", "$createdAt"] }, 1000] } } },
      { $group: { _id: null, p: pct("$s", [0.5, 0.95]), n: { $sum: 1 } } },
    ])
    .toArray();

  const lag = facet.summaryLagSec[0];
  const bucketLabel = (id: number | string) => {
    if (typeof id === "string") return id;
    const next = DURATION_BUCKETS[DURATION_BUCKETS.indexOf(id) + 1];
    return `${id}-${next}`;
  };
  return {
    dataEnv,
    range: { from: range.fromDay, to: range.toDay, timezone: IST_TZ },
    durationByChannel: facet.byChannel.map((row: Document) => ({
      channel: row._id,
      calls: row.calls,
      medianSec: round(row.p[0]),
      p95Sec: round(row.p[1]),
      medianCallerTurns: round(row.turns[0]),
    })),
    durationBuckets: facet.buckets.map((row: Document) => ({ seconds: bucketLabel(row._id), count: row.n })),
    alertDelaySec: alertDelay ? { count: alertDelay.n, median: round(alertDelay.p[0]), p95: round(alertDelay.p[1]) } : null,
    summaryLagSec: lag ? { count: lag.n, median: round(lag.p[0]), p95: round(lag.p[1]) } : null,
    notRecorded: { stageLatency: NOT_RECORDED.stageLatency },
  };
}

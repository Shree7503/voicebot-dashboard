/**
 * How a call ended, from what citizen_store records for every interaction. The bot does not
 * record an explicit outcome, so this is derived:
 *
 *   no_speech  the caller's speech was never recognised (0 caller turns)
 *   short      the caller hung up early: fewer than 2 caller turns, or under 25 seconds
 *              (the same 25 s case_store uses to mark a short emergency call)
 *   completed  everything else
 */

export const SHORT_CALL_S = 25;
export const MIN_CALLER_TURNS = 2;
export const OUTCOMES = ["completed", "short", "no_speech"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export function outcomeOf(interaction: { durationSec?: number | null; turnCounts?: { citizen?: number | null } | null }): Outcome {
  const turns = interaction.turnCounts?.citizen ?? 0;
  if (turns === 0) return "no_speech";
  if (turns < MIN_CALLER_TURNS || (interaction.durationSec ?? 0) < SHORT_CALL_S) return "short";
  return "completed";
}

/** The same rule as a MongoDB aggregation expression. */
export const outcomeExpr = {
  $switch: {
    branches: [
      { case: { $lte: [{ $ifNull: ["$turnCounts.citizen", 0] }, 0] }, then: "no_speech" },
      {
        case: {
          $or: [
            { $lt: [{ $ifNull: ["$turnCounts.citizen", 0] }, MIN_CALLER_TURNS] },
            { $lt: [{ $ifNull: ["$durationSec", 0] }, SHORT_CALL_S] },
          ],
        },
        then: "short",
      },
    ],
    default: "completed",
  },
};

/** Mongo match for one outcome, for filtering lists. */
export function outcomeMatch(outcome: Outcome) {
  return { $expr: { $eq: [outcomeExpr, outcome] } };
}

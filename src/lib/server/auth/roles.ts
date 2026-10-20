/**
 * Roles, from the implementation plan:
 *   admin     reads everything, makes every change (config, tones, users, case actions)
 *   reviewer  reads call- and case-level data (masked), sets case status and verdicts
 *   viewer    reads aggregate stats only
 */

export const ROLES = ["admin", "reviewer", "viewer"] as const;
export type Role = (typeof ROLES)[number];

const RANK: Record<Role, number> = { viewer: 1, reviewer: 2, admin: 3 };

/** True when `role` is at least `needed`. */
export function hasRole(role: Role, needed: Role): boolean {
  return RANK[role] >= RANK[needed];
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

import "server-only";

import type { Filter } from "mongodb";
import { DASH, dashCol } from "../db";
import type { Actor } from "../http";

/**
 * Every change made through the dashboard, with the document before and after. Written after
 * the change succeeds; a failure to write it fails the request, so a change is never silent.
 */

export interface AuditDoc {
  userId: string;
  userName: string;
  role: string;
  action: string;
  target: string;
  before: unknown;
  after: unknown;
  note?: string;
  ip: string | null;
  at: Date;
}

export async function audit(
  actor: Actor,
  action: string,
  target: string,
  before: unknown,
  after: unknown,
  note?: string,
): Promise<void> {
  const log = await dashCol<AuditDoc>(DASH.audit);
  await log.insertOne({
    userId: actor.id,
    userName: actor.name,
    role: actor.role,
    action,
    target,
    before: before ?? null,
    after: after ?? null,
    ...(note ? { note } : {}),
    ip: actor.ip,
    at: new Date(),
  });
}

export interface AuditQuery {
  action?: string;
  userName?: string;
  target?: string;
  before?: Date;
  limit: number;
}

export async function listAudit(query: AuditQuery) {
  const log = await dashCol<AuditDoc>(DASH.audit);
  const filter: Filter<AuditDoc> = {};
  if (query.action) filter.action = query.action;
  if (query.userName) filter.userName = query.userName;
  if (query.target) filter.target = query.target;
  if (query.before) filter.at = { $lt: query.before };
  const rows = await log.find(filter).sort({ at: -1 }).limit(query.limit + 1).toArray();
  const page = rows.slice(0, query.limit);
  return {
    items: page.map(({ _id, ...row }) => ({ id: _id.toHexString(), ...row })),
    // pass as ?before= for the next page
    nextBefore: rows.length > query.limit ? page[page.length - 1].at.toISOString() : null,
  };
}

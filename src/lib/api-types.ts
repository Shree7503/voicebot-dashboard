/** Shapes the dashboard API returns (src/app/api). */

export type Priority = "P1" | "P2" | "P3" | "P4";
export type CaseStatus = "new" | "alerted" | "acknowledged" | "closed";
export type VerdictValue = "genuine" | "hoax" | "unverifiable";

export interface Category {
  code: string;
  mr: string | null;
  en: string;
}

export interface CaseSummary {
  id: string;
  category: Category;
  priority: Priority;
  priorityReason: string | null;
  status: CaseStatus;
  channel: string | null;
  station: string | null;
  summary: string | null;
  place: string | null;
  caller: string | null;
  callId: string | null;
  credibility: string | null;
  verdict: VerdictValue | null;
  incidentId: string | null;
  createdAt: string;
  alertedAt: string | null;
  acknowledgedAt: string | null;
  closedAt: string | null;
}

export interface CaseDetail extends Omit<CaseSummary, "station" | "credibility" | "verdict"> {
  station: { name: string | null; phone: string | null } | null;
  location: { spoken: string | null; english: string | null };
  flags: Partial<Record<"injured" | "weapon" | "happeningNow" | "callerSafe", "yes" | "no" | "unknown">>;
  description: { mr: string | null; asGiven: string | null };
  details: { detailsMr: string | null; injuredDetail: string | null; weaponDetail: string | null } | null;
  credibility: { level: string | null; score: number | null; reasons: string[] } | null;
  verdict: { value: VerdictValue; by: string; at: string; note: string | null } | null;
  incident: { id: string; reports: number; caseIds: string[] } | null;
  alerts: { id: string; kind: string; status: string; attempts: number; sentAt: string | null; createdAt: string }[];
  timeline: { kind: string; at: string; by: string; data: Record<string, unknown> }[];
}

export type Outcome = "completed" | "short" | "no_speech";

export interface CallRow {
  id: string;
  channel: string;
  caller: string | null;
  startedAt: string;
  durationSec: number | null;
  outcome: Outcome;
  turns: { caller: number; bot: number; tools: number };
  toolsUsed: string[];
  language: string | null;
  topics: string[];
  clear: boolean | null;
  processing: string;
  summary: string | null;
  cases: { id: string; priority: Priority; category?: string; status?: CaseStatus }[];
}

export interface CallDetail extends CallRow {
  endedAt: string | null;
}

export interface Transcript {
  available: boolean;
  expiresAt?: string | null;
  turns: { speaker: "caller" | "bot" | "tool"; text: string }[];
}

export interface Page<T> {
  items: T[];
  nextBefore: string | null;
}

export interface Overview {
  totals: {
    calls: number;
    uniqueCallers: number;
    totalMinutes: number | null;
    avgDurationSec: number | null;
    medianDurationSec: number | null;
    completionRate: number | null;
    emergencies: number;
    emergenciesP1: number;
    alertsSent: number;
    outcomes: Record<Outcome, number>;
  };
  perDay: { day: string; calls: number; minutes: number; emergencies: number; p1: number; alertsSent: number }[];
  cost: { perMinuteInr: number; totalInr: number | null; perCallInr: number | null } | null;
}

export interface Languages {
  total: number;
  languages: { language: string; calls: number; share: number | null }[];
}

export interface Outcomes {
  emergencies: { total: number; byCategory: (Category & { count: number })[] };
}

export type LostFoundStatus = "open" | "suggested" | "reunited" | "closed" | "unknown";

export interface LostFoundStats {
  byStatus: Record<Exclude<LostFoundStatus, "unknown">, number>;
  perDay: { day: string; reported: number; reunited: number }[];
}

export interface LostFoundItem {
  id: string;
  status: LostFoundStatus;
  station: string | null;
  reportedAt: string | null;
  updatedAt: string | null;
}

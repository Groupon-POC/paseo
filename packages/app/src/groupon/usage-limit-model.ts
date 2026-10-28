// Added for Groupon Desk (fork of Paseo, Apache-2.0): Claude Code's "You've hit your limit" message, read for the chat's red notice and its countdown.

export interface UsageLimitNotice {
  /** "5-hour", "weekly", "Opus weekly": the limit the session ran into. */
  limit: string;
  /** The reset as Claude Code wrote it, "7pm (Europe/Prague)". */
  resetsText: string;
  /** When the limit resets, when the message says so plainly; null otherwise. */
  resetsAt: Date | null;
}

const HIT_LIMIT = /^You['’]ve hit your (.+?) limit\s*[·•∙|-]\s*resets\s+(.+?)\s*$/i;
const LEGACY = /^Claude AI usage limit reached\|(\d{9,})\s*$/;
const CLOCK = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?:\s*\(([^)]+)\))?$/i;

export function parseUsageLimitMessage(text: string, sentAt: Date): UsageLimitNotice | null {
  const trimmed = text.trim();
  const legacy = LEGACY.exec(trimmed);
  if (legacy?.[1]) {
    const resetsAt = new Date(Number(legacy[1]) * 1000);
    return { limit: "usage", resetsText: resetsAt.toLocaleTimeString(), resetsAt };
  }
  const hit = HIT_LIMIT.exec(trimmed);
  if (!hit?.[1] || !hit[2]) return null;
  return { limit: hit[1], resetsText: hit[2], resetsAt: clockResetAfter(hit[2], sentAt) };
}

/** The first moment after `sentAt` the clock "7pm (Europe/Prague)" reads in its zone. */
function clockResetAfter(text: string, sentAt: Date): Date | null {
  const clock = CLOCK.exec(text.trim());
  if (!clock?.[1] || !clock[3]) return null;
  const hour = (Number(clock[1]) % 12) + (clock[3].toLowerCase() === "pm" ? 12 : 0);
  const minute = Number(clock[2] ?? 0);
  const now = wallClockMinutes(sentAt, clock[4]);
  if (now === null) return null;
  let wait = hour * 60 + minute - now;
  if (wait <= 0) wait += 24 * 60;
  const at = new Date(sentAt.getTime() + wait * 60_000);
  at.setSeconds(0, 0);
  return at;
}

function wallClockMinutes(at: Date, timeZone: string | undefined): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    }).formatToParts(at);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
  } catch {
    return null;
  }
}

/** "2h 14m" or "14m"; null once the reset has passed. */
export function timeUntilReset(resetsAt: Date, now: number): string | null {
  const minutes = Math.ceil((resetsAt.getTime() - now) / 60_000);
  if (minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

// Date helpers. Spec D4: all interpretation happens in the user's
// browser-local timezone; the server only stores UTC instants.

export function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local calendar-day key of a stored instant ("YYYY-MM-DD"). */
export function dayKeyOf(iso: string): string {
  return ymdLocal(new Date(iso));
}

/** First/last instants of the month containing `cursor` (local). */
export function monthRange(cursor: Date): { from: string; to: string } {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  return { from: first.toISOString(), to: last.toISOString() };
}

export function fmtDue(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Split an instant into local <input type=date> / <input type=time> values. */
export function splitIso(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: ymdLocal(d),
    time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
  };
}

/** Combine local date/time input values into a UTC instant (EOD default). */
export function combineLocal(date: string, time?: string): string {
  const t = time && time.length > 0 ? time : "23:59";
  return new Date(`${date}T${t}:00`).toISOString();
}

/** "Due soon" = within the next 7 days (spec UX flow step 7). */
export function isDueSoon(iso: string, now = Date.now()): boolean {
  const t = new Date(iso).getTime();
  return t >= now && t - now <= 7 * 24 * 60 * 60 * 1000;
}

export function isOverdue(iso: string, done: boolean, now = Date.now()): boolean {
  return !done && new Date(iso).getTime() < now;
}

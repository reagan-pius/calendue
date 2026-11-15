"use client";

import { useMemo } from "react";
import type { Deadline } from "@/lib/deadlines/types";
import { fmtDue, isDueSoon, isOverdue } from "@/lib/dates";

interface ListViewProps {
  deadlines: Deadline[];
  loading: boolean;
  /** Epoch ms sampled by the parent in an async context; 0 before first load. */
  now: number;
  onEdit: (d: Deadline) => void;
  onToggle: (d: Deadline) => void;
  onAdd?: () => void;
}

// List: overdue first (hard once-due), then upcoming, done below with
// strikethrough. Due-soon and overdue get list labels for scanability.
export default function ListView({
  deadlines,
  loading,
  now,
  onEdit,
  onToggle,
  onAdd,
}: ListViewProps) {
  const rows = useMemo(() => {
    const byDue = (a: Deadline, b: Deadline) =>
      (a.due_at ? new Date(a.due_at).getTime() : Infinity) -
      (b.due_at ? new Date(b.due_at).getTime() : Infinity);
    const active = deadlines.filter((d) => !d.done);
    const overdue = active
      .filter((d) => d.due_at !== null && new Date(d.due_at).getTime() < now)
      .sort(byDue);
    const upcoming = active
      .filter((d) => !d.due_at || new Date(d.due_at).getTime() >= now)
      .sort(byDue);
    const done = deadlines.filter((d) => d.done).sort(byDue);
    return [...overdue, ...upcoming, ...done];
  }, [deadlines, now]);

  if (loading) {
    return <p className="py-16 text-center text-sm text-muted">Loading…</p>;
  }
  if (deadlines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-24">
        <p className="text-sm text-muted">No deadlines yet.</p>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="rounded-[6px] bg-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Add deadlines
          </button>
        )}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-hairline border-y border-hairline">
      {rows.map((d) => {
        const overdueRow = d.due_at ? isOverdue(d.due_at, d.done, now) : false;
        const soonRow =
          !overdueRow && !d.done && d.due_at ? isDueSoon(d.due_at, now) : false;
        return (
          <li key={d.id} className="flex items-center gap-3 py-2.5 text-sm">
            <input
              type="checkbox"
              checked={d.done}
              onChange={() => onToggle(d)}
              className="h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
              aria-label={`Mark ${d.title} done`}
            />
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: d.color ?? "#6B7280" }}
            />
            <button
              type="button"
              onClick={() => onEdit(d)}
              className={`min-w-0 flex-1 truncate text-left underline-offset-2 hover:underline ${
                d.done ? "line-through text-muted" : ""
              }`}
            >
              {d.title}
            </button>
            {d.module && (
              <span className="hidden shrink-0 text-xs text-muted sm:inline">{d.module}</span>
            )}
            <span className="shrink-0 text-xs text-muted">
              {d.due_at ? fmtDue(d.due_at) : "No date"}
            </span>
            {overdueRow && (
              <span className="shrink-0 rounded-[4px] bg-[#DC2626]/10 px-1.5 py-0.5 text-[11px] font-medium text-[#DC2626]">
                Overdue
              </span>
            )}
            {soonRow && (
              <span className="shrink-0 rounded-[4px] bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent">
                Due soon
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

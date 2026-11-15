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
  onAdd: () => void;
}

type Section = { key: string; label: string; items: Deadline[] };

// List: overdue first (hard once-due), then upcoming, done below with
// strikethrough. Section headers aid scanability.
export default function ListView({
  deadlines,
  loading,
  now,
  onEdit,
  onToggle,
  onAdd,
}: ListViewProps) {
  const sections = useMemo((): Section[] => {
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
    const out: Section[] = [];
    if (overdue.length) out.push({ key: "overdue", label: "Overdue", items: overdue });
    if (upcoming.length) out.push({ key: "upcoming", label: "Upcoming", items: upcoming });
    if (done.length) out.push({ key: "done", label: "Done", items: done });
    return out;
  }, [deadlines, now]);

  // now===0 is the pre-mount SSR clock; classifying against it empties Overdue.
  if (loading || now === 0) {
    return <p className="py-16 text-center text-sm text-muted">Loading…</p>;
  }
  if (deadlines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-32">
        <p className="text-sm text-muted">No deadlines yet. Paste from Moodle or a chat.</p>
        <button
          type="button"
          onClick={onAdd}
          className="btn-press rounded-[6px] bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          Add deadlines
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <section key={section.key} aria-labelledby={`list-${section.key}`}>
          <h3
            id={`list-${section.key}`}
            className="mb-2 border-b border-hairline pb-1 text-[11px] font-medium uppercase tracking-wide text-muted"
          >
            {section.label}
          </h3>
          <ul className="divide-y divide-hairline">
            {section.items.map((d) => {
              const overdueRow = d.due_at ? isOverdue(d.due_at, d.done, now) : false;
              const soonRow =
                !overdueRow && !d.done && d.due_at ? isDueSoon(d.due_at, now) : false;
              return (
                <li key={d.id} className="flex items-center gap-3 py-3 text-sm">
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
                    onPointerEnter={() => {
                      void import("@/components/EditModal");
                    }}
                    className={`min-w-0 flex-1 truncate text-left text-[14px] underline-offset-2 hover:underline ${
                      d.done ? "line-through text-muted" : ""
                    }`}
                  >
                    {d.title}
                  </button>
                  {d.module && (
                    <span className="hidden shrink-0 text-xs text-muted sm:inline">
                      {d.module}
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-muted">
                    {d.due_at ? fmtDue(d.due_at) : "No date"}
                  </span>
                  {overdueRow && (
                    <span className="shrink-0 text-[11px] font-medium text-[#DC2626]">
                      Overdue
                    </span>
                  )}
                  {soonRow && (
                    <span className="shrink-0 text-[11px] font-medium text-ink">
                      Due soon
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import type { Deadline } from "@/lib/deadlines/types";
import { dayKeyOf, fmtTime, isOverdue, ymdLocal } from "@/lib/dates";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

interface MonthCalendarProps {
  cursor: Date;
  /** Epoch ms from parent (set after mount); avoids Date.now() during SSR. */
  now: number;
  deadlines: Deadline[];
  onEdit: (d: Deadline) => void;
  onDelete: (id: string) => void;
  onToggle: (d: Deadline) => void;
}

// Spec: hairline month grid, quiet day numbers, type-colored chips, no cell
// fills; click day/chip for popover with that day's deadlines + edit.
export default function MonthCalendar({
  cursor,
  now,
  deadlines,
  onEdit,
  onDelete,
  onToggle,
}: MonthCalendarProps) {
  const [popoverDay, setPopoverDay] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!popoverDay) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPopoverDay(null);
        setConfirmDeleteId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popoverDay]);

  const byDay = useMemo(() => {
    const map = new Map<string, Deadline[]>();
    for (const d of deadlines) {
      if (!d.due_at) continue;
      const key = dayKeyOf(d.due_at);
      const arr = map.get(key);
      if (arr) arr.push(d);
      else map.set(key, [d]);
    }
    return map;
  }, [deadlines]);

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // Monday start
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - offset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return {
        key: ymdLocal(d),
        day: d.getDate(),
        inMonth: d.getMonth() === cursor.getMonth(),
        date: d,
      };
    });
  }, [cursor]);

  const todayKey = now > 0 ? ymdLocal(new Date(now)) : null;
  const popoverItems = popoverDay ? (byDay.get(popoverDay) ?? []) : [];

  return (
    <>
      {popoverDay && (
        <button
          type="button"
          aria-label="Close day details"
          className="fixed inset-0 z-20 cursor-default"
          onClick={() => {
            setPopoverDay(null);
            setConfirmDeleteId(null);
          }}
        />
      )}

      <div className="grid grid-cols-7 border-b border-hairline pb-1 text-[11px] text-muted">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-2 py-1">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((c) => {
          const items = byDay.get(c.key) ?? [];
          const isToday = c.key === todayKey;
          const dayLabel = c.date.toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          });
          return (
            <div
              key={c.key}
              className={`relative min-h-[104px] border-b border-r border-hairline p-1.5 ${
                popoverDay === c.key ? "z-30" : ""
              }`}
            >
              <button
                type="button"
                aria-label={dayLabel}
                onClick={() => setPopoverDay(popoverDay === c.key ? null : c.key)}
                className={`mb-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px] tabular-nums ${
                  isToday
                    ? "font-medium text-accent"
                    : c.inMonth
                      ? "text-ink"
                      : "text-muted"
                }`}
              >
                {c.day}
              </button>

              <div className="flex flex-col gap-1">
                {items.slice(0, 2).map((d) => {
                  const overdue = d.due_at
                    ? isOverdue(d.due_at, d.done, now)
                    : false;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      aria-label={d.title}
                      onClick={() => setPopoverDay(c.key)}
                      className={`flex w-full items-center gap-1 rounded-[4px] px-1.5 py-1 text-left text-[11px] leading-tight ${
                        d.done
                          ? "line-through text-muted"
                          : overdue
                            ? "font-medium text-ink"
                            : "text-ink"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${overdue && !d.done ? "ring-1 ring-[#DC2626]/70" : ""}`}
                        style={{ backgroundColor: d.color ?? "#6B7280" }}
                      />
                      <span className="truncate">{d.title}</span>
                    </button>
                  );
                })}
                {items.length > 2 && (
                  <span className="px-1 text-[10px] text-muted">
                    +{items.length - 2} more
                  </span>
                )}
              </div>

              {popoverDay === c.key && (
                <div className="panel-enter absolute left-1 top-full z-30 mt-1 w-[272px] rounded-[8px] border border-hairline bg-canvas p-3 shadow-lg">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium">
                      {c.date.toLocaleDateString("en-GB", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setPopoverDay(null);
                        setConfirmDeleteId(null);
                      }}
                      className="text-xs text-muted hover:text-ink"
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>

                  {popoverItems.length === 0 ? (
                    <p className="text-xs text-muted">Nothing due.</p>
                  ) : (
                    <ul className="flex flex-col divide-y divide-hairline">
                      {popoverItems.map((d) => (
                        <li key={d.id} className="flex items-start gap-2 py-2">
                          <input
                            type="checkbox"
                            checked={d.done}
                            onChange={() => onToggle(d)}
                            className="mt-0.5 h-3.5 w-3.5 accent-[var(--accent)]"
                            aria-label={`Mark ${d.title} done`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className={`text-xs ${d.done ? "line-through text-muted" : ""}`}>
                              {d.title}
                            </p>
                            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: d.color ?? "#6B7280" }}
                              />
                              {d.due_at ? fmtTime(d.due_at) : "no time"}
                              {d.module ? <> · {d.module}</> : null}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setPopoverDay(null);
                                onEdit(d);
                              }}
                              onPointerEnter={() => {
                                void import("@/components/EditModal");
                              }}
                              className="text-[11px] text-muted underline-offset-2 hover:text-ink hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (confirmDeleteId === d.id) {
                                  onDelete(d.id);
                                  setConfirmDeleteId(null);
                                } else {
                                  setConfirmDeleteId(d.id);
                                }
                              }}
                              className="text-[11px] text-muted underline-offset-2 hover:text-[#DC2626] hover:underline"
                            >
                              {confirmDeleteId === d.id ? "Confirm" : "Delete"}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

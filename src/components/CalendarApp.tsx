"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TopBar, { type View } from "@/components/TopBar";
import MonthCalendar from "@/components/MonthCalendar";
import ListView from "@/components/ListView";
import CaptureModal from "@/components/CaptureModal";
import EditModal from "@/components/EditModal";
import type { Deadline } from "@/lib/deadlines/types";
import { dayKeyOf, ymdLocal } from "@/lib/dates";

// Pick the month to view after a data load: keep the current month when it
// holds deadlines; otherwise jump to the month of the nearest upcoming
// deadline (pure — clock is passed in).
function chooseCursor(
  list: Deadline[],
  current: Date,
  todayStart: Date,
): Date {
  const monthKey = ymdLocal(current).slice(0, 7);
  const inView = list.some(
    (d) => d.due_at && dayKeyOf(d.due_at).slice(0, 7) === monthKey,
  );
  if (inView) return current;
  const upcoming = list
    .filter(
      (d) =>
        d.due_at && new Date(d.due_at).getTime() >= todayStart.getTime(),
    )
    .sort(
      (a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime(),
    )[0];
  if (!upcoming?.due_at) return current;
  const due = new Date(upcoming.due_at);
  return new Date(due.getFullYear(), due.getMonth(), 1);
}

// Home surface: Calendar/List toggle, month nav, capture modal, day popover,
// toast after hybrid commit. Data is fetched client-side in browser-local tz
// (spec D4). One fetch returns ALL deadlines: List shows every entry; the
// month grid filters by the viewed month.
export default function CalendarApp({ email }: { email: string }) {
  const [view, setView] = useState<View>("calendar");
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);
  // Wall clock sampled in async load (not during render — purity rules).
  const [now, setNow] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [editing, setEditing] = useState<Deadline | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (opts?: { jumpToNearest?: boolean }) => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    try {
      const res = await fetch(`/api/deadlines`);
      if (res.ok) {
        const list = (await res.json()) as Deadline[];
        setDeadlines(list);
        if (opts?.jumpToNearest) {
          // After a capture: never sit on an empty month when the fresh
          // deadlines live elsewhere.
          setCursor((c) => chooseCursor(list, c, todayStart));
        }
        // Login/first load: no jump — always land on today's month (the
        // cursor initialises to today; the header hint surfaces deadlines
        // that live in other months).
      }
    } finally {
      setNow(Date.now());
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  async function patchDeadline(id: string, patch: Record<string, unknown>) {
    const res = await fetch(`/api/deadlines/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return null;
    const updated = (await res.json()) as Deadline;
    setDeadlines((ds) => ds.map((d) => (d.id === id ? updated : d)));
    return updated;
  }

  async function removeDeadline(id: string) {
    const res = await fetch(`/api/deadlines/${id}`, { method: "DELETE" });
    if (res.ok) {
      setDeadlines((ds) => ds.filter((d) => d.id !== id));
      showToast("Deleted");
    }
  }

  function stepMonth(delta: number) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  }

  function goToday() {
    const n = new Date();
    setCursor(new Date(n.getFullYear(), n.getMonth(), 1));
  }

  const monthLabel = cursor.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  // Quiet pointer: when the viewed month (today's month on login) has no
  // deadlines but upcoming ones exist elsewhere, show where the next one is.
  const hint = useMemo(() => {
    if (loading || view !== "calendar" || now === 0) return null;
    const monthKey = ymdLocal(cursor).slice(0, 7);
    const inMonth = deadlines.some(
      (d) => d.due_at && dayKeyOf(d.due_at).slice(0, 7) === monthKey,
    );
    if (inMonth) return null;
    const upcoming = deadlines
      .filter(
        (d) =>
          d.due_at && !d.done && new Date(d.due_at).getTime() >= now,
      )
      .sort(
        (a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime(),
      )[0];
    if (!upcoming?.due_at) return null;
    const dueDate = new Date(upcoming.due_at);
    if (ymdLocal(dueDate).slice(0, 7) === monthKey) return null;
    return {
      deadline: upcoming,
      label: `${upcoming.title} · ${dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`,
    };
  }, [loading, view, cursor, deadlines, now]);

  function jumpToMonth(d: Deadline) {
    if (!d.due_at) return;
    const due = new Date(d.due_at);
    setCursor(new Date(due.getFullYear(), due.getMonth(), 1));
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <TopBar view={view} onView={setView} onAdd={() => setCaptureOpen(true)} email={email} />

      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        {view === "calendar" ? (
          <>
            <div className="mb-4 flex items-center gap-2">
              <h2 className="text-[15px] font-medium">{monthLabel}</h2>
              <div className="ml-2 flex items-center">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => stepMonth(-1)}
                  className="flex h-7 w-7 items-center justify-center rounded-[6px] text-muted transition-colors hover:bg-black/5 hover:text-ink"
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() => stepMonth(1)}
                  className="flex h-7 w-7 items-center justify-center rounded-[6px] text-muted transition-colors hover:bg-black/5 hover:text-ink"
                >
                  ›
                </button>
              </div>
              <button
                type="button"
                onClick={goToday}
                className="ml-2 text-xs text-muted underline-offset-2 transition-colors hover:text-ink hover:underline"
              >
                Today
              </button>
              {hint && (
                <button
                  type="button"
                  onClick={() => jumpToMonth(hint.deadline)}
                  title="Jump to the next upcoming deadline"
                  className="ml-auto max-w-[55%] truncate text-xs text-muted underline-offset-2 transition-colors hover:text-ink hover:underline"
                >
                  Next: {hint.label} ›
                </button>
              )}
            </div>

            {loading ? (
              <p className="py-16 text-center text-sm text-muted">Loading…</p>
            ) : deadlines.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-24">
                <p className="text-sm text-muted">No deadlines yet.</p>
                <button
                  type="button"
                  onClick={() => setCaptureOpen(true)}
                  className="rounded-[6px] bg-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  Add deadlines
                </button>
              </div>
            ) : (
              <MonthCalendar
                cursor={cursor}
                deadlines={deadlines}
                onEdit={setEditing}
                onDelete={removeDeadline}
                onToggle={(d) => patchDeadline(d.id, { done: !d.done })}
              />
            )}
          </>
        ) : (
          <ListView
            deadlines={deadlines}
            loading={loading}
            now={now}
            onEdit={setEditing}
            onToggle={(d) => patchDeadline(d.id, { done: !d.done })}
          />
        )}
      </main>

      {captureOpen && (
        <CaptureModal
          onClose={() => setCaptureOpen(false)}
          onDone={(msg) => {
            setCaptureOpen(false);
            load({ jumpToNearest: true });
            showToast(msg);
          }}
        />
      )}

      {editing && (
        <EditModal
          deadline={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setDeadlines((ds) => ds.map((d) => (d.id === updated.id ? updated : d)));
            setEditing(null);
            showToast("Saved");
          }}
          onDeleted={(id) => {
            setDeadlines((ds) => ds.filter((d) => d.id !== id));
            setEditing(null);
            showToast("Deleted");
          }}
        />
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-[8px] border border-hairline bg-canvas px-4 py-2 text-sm shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

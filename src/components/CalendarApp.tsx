"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import TopBar, { type View } from "@/components/TopBar";
import MonthCalendar from "@/components/MonthCalendar";
import ListView from "@/components/ListView";
import type { Deadline } from "@/lib/deadlines/types";
import { dayKeyOf, ymdLocal } from "@/lib/dates";

// Modals stay out of the initial client bundle — client-only (overlay UI).
const CaptureModal = dynamic(() => import("@/components/CaptureModal"), {
  ssr: false,
});
const EditModal = dynamic(() => import("@/components/EditModal"), {
  ssr: false,
});

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
// toast after hybrid commit. First paint uses server-fetched deadlines;
// subsequent reloads hit /api/deadlines (browser-local tz, spec D4).
export default function CalendarApp({
  email,
  initialDeadlines,
}: {
  email: string;
  initialDeadlines: Deadline[];
}) {
  const [view, setView] = useState<View>("calendar");
  // Cursor + wall clock stay unset until after mount — `new Date()` /
  // Date.now() during SSR trips Cache Components prerender errors.
  const [cursor, setCursor] = useState<Date | null>(null);
  const [deadlines, setDeadlines] = useState<Deadline[]>(initialDeadlines);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [editing, setEditing] = useState<Deadline | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    const n = new Date();
    setNow(n.getTime());
    setCursor(new Date(n.getFullYear(), n.getMonth(), 1));
  }, []);

  const load = useCallback(async (opts?: { jumpToNearest?: boolean }) => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    try {
      const res = await fetch(`/api/deadlines`);
      if (!res.ok) {
        setLoadError("Couldn’t load deadlines.");
        return;
      }
      const list = (await res.json()) as Deadline[];
      setDeadlines(list);
      setLoadError(null);
      if (opts?.jumpToNearest) {
        setCursor((c) =>
          chooseCursor(
            list,
            c ?? new Date(todayStart.getFullYear(), todayStart.getMonth(), 1),
            todayStart,
          ),
        );
      }
    } catch {
      setLoadError("Couldn’t load deadlines.");
    } finally {
      setNow(Date.now());
      setLoading(false);
    }
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
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
    setCursor((c) => {
      if (!c) return c;
      return new Date(c.getFullYear(), c.getMonth() + delta, 1);
    });
  }

  function goToday() {
    const n = new Date();
    setCursor(new Date(n.getFullYear(), n.getMonth(), 1));
  }

  const monthLabel = cursor
    ? cursor.toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      })
    : "";

  const hint = useMemo(() => {
    if (loading || view !== "calendar" || now === 0 || !cursor) return null;
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

  const clockReady = cursor !== null && now > 0;

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <TopBar view={view} onView={setView} onAdd={() => setCaptureOpen(true)} email={email} />

      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        {view === "calendar" ? (
          <>
            <div className="mb-4 flex items-center gap-2">
              <h2 className="text-[15px] font-medium">{monthLabel || "\u00a0"}</h2>
              <div className="ml-2 flex items-center">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => stepMonth(-1)}
                  disabled={!clockReady}
                  className="flex h-7 w-7 items-center justify-center rounded-[6px] text-muted hover:bg-black/5 hover:text-ink disabled:opacity-40"
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() => stepMonth(1)}
                  disabled={!clockReady}
                  className="flex h-7 w-7 items-center justify-center rounded-[6px] text-muted hover:bg-black/5 hover:text-ink disabled:opacity-40"
                >
                  ›
                </button>
              </div>
              <button
                type="button"
                onClick={goToday}
                disabled={!clockReady}
                className="ml-2 text-xs text-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-40"
              >
                Today
              </button>
              {hint && (
                <button
                  type="button"
                  onClick={() => jumpToMonth(hint.deadline)}
                  title="Jump to the next upcoming deadline"
                  className="ml-auto max-w-[55%] truncate text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
                >
                  Next: {hint.label} ›
                </button>
              )}
            </div>

            {!clockReady || loading ? (
              <p className="py-16 text-center text-sm text-muted">Loading…</p>
            ) : loadError ? (
              <div className="flex flex-col items-center gap-3 py-24">
                <p className="text-sm text-muted">{loadError}</p>
                <button
                  type="button"
                  onClick={() => {
                    setLoading(true);
                    load();
                  }}
                  className="rounded-[6px] border border-hairline px-3 py-1.5 text-sm text-muted hover:text-ink"
                >
                  Try again
                </button>
              </div>
            ) : deadlines.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-24">
                <p className="text-sm text-muted">No deadlines yet. Paste from Moodle or a chat.</p>
                <button
                  type="button"
                  onClick={() => setCaptureOpen(true)}
                  onPointerEnter={() => {
                    void import("@/components/CaptureModal");
                  }}
                  className="rounded-[6px] bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                >
                  Add deadlines
                </button>
              </div>
            ) : cursor ? (
              <MonthCalendar
                cursor={cursor}
                now={now}
                deadlines={deadlines}
                onEdit={setEditing}
                onDelete={removeDeadline}
                onToggle={(d) => patchDeadline(d.id, { done: !d.done })}
              />
            ) : null}
          </>
        ) : loadError && !loading ? (
          <div className="flex flex-col items-center gap-3 py-24">
            <p className="text-sm text-muted">{loadError}</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                load();
              }}
              className="rounded-[6px] border border-hairline px-3 py-1.5 text-sm text-muted hover:text-ink"
            >
              Try again
            </button>
          </div>
        ) : (
          <ListView
            deadlines={deadlines}
            loading={loading}
            now={now}
            onEdit={setEditing}
            onToggle={(d) => patchDeadline(d.id, { done: !d.done })}
            onAdd={() => setCaptureOpen(true)}
          />
        )}
      </main>

      {captureOpen && (
        <CaptureModal
          onClose={() => setCaptureOpen(false)}
          onDone={(msg) => {
            setCaptureOpen(false);
            setLoading(true);
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

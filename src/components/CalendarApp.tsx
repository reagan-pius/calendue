"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import TopBar, { type View } from "@/components/TopBar";
import MonthCalendar from "@/components/MonthCalendar";
import ListView from "@/components/ListView";
import type { Deadline } from "@/lib/deadlines/types";
import { dayKeyOf, isOverdue, ymdLocal } from "@/lib/dates";

const CaptureModal = dynamic(() => import("@/components/CaptureModal"), {
  ssr: false,
});
const EditModal = dynamic(() => import("@/components/EditModal"), {
  ssr: false,
});

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

export default function CalendarApp({
  email,
  initialDeadlines,
}: {
  email: string;
  initialDeadlines: Deadline[];
}) {
  const [view, setView] = useState<View>("calendar");
  const [cursor, setCursor] = useState<Date | null>(null);
  const [deadlines, setDeadlines] = useState<Deadline[]>(initialDeadlines);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [editing, setEditing] = useState<Deadline | null>(null);
  const [creating, setCreating] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusOverdueRef = useRef(false);

  // Client-only clock: Cache Components must not prerender against Date.now().
  // Sync setState in useLayoutEffect so the first paint already has a local month.
  useLayoutEffect(() => {
    const n = new Date();
    /* eslint-disable react-hooks/set-state-in-effect -- intentional post-mount clock seed */
    setNow(n.getTime());
    setCursor(new Date(n.getFullYear(), n.getMonth(), 1));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (view !== "list" || !focusOverdueRef.current) return;
    focusOverdueRef.current = false;
    const el = document.getElementById("list-overdue");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    el?.focus({ preventScroll: true });
  }, [view, loading, deadlines]);

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

  const overdueCue = useMemo(() => {
    if (loading || view !== "calendar" || now === 0 || !cursor) return 0;
    const monthKey = ymdLocal(cursor).slice(0, 7);
    const openInMonth = deadlines.some(
      (d) =>
        !d.done &&
        d.due_at &&
        dayKeyOf(d.due_at).slice(0, 7) === monthKey &&
        new Date(d.due_at).getTime() >= now,
    );
    if (openInMonth) return 0;
    return deadlines.filter(
      (d) => d.due_at !== null && isOverdue(d.due_at, d.done, now),
    ).length;
  }, [loading, view, cursor, deadlines, now]);

  function jumpToMonth(d: Deadline) {
    if (!d.due_at) return;
    const due = new Date(d.due_at);
    setCursor(new Date(due.getFullYear(), due.getMonth(), 1));
  }

  const clockReady = cursor !== null && now > 0;

  function openManual() {
    setCaptureOpen(false);
    setEditing(null);
    setCreating(true);
  }

  function openEdit(d: Deadline) {
    setCreating(false);
    setEditing(d);
  }

  function closeEditModal() {
    setEditing(null);
    setCreating(false);
  }

  function openCapture() {
    closeEditModal();
    setCaptureOpen(true);
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <TopBar
        view={view}
        onView={setView}
        onAdd={openCapture}
        email={email}
      />

      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        {view === "calendar" ? (
          <>
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-medium tracking-tight text-balance">
                {monthLabel || "\u00a0"}
              </h2>
              <div className="ml-2 flex items-center">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => stepMonth(-1)}
                  disabled={!clockReady}
                  className="flex h-7 w-7 items-center justify-center rounded-[6px] text-muted hover:bg-black/5 hover:text-ink disabled:opacity-40"
                >
                  {"<"}
                </button>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() => stepMonth(1)}
                  disabled={!clockReady}
                  className="flex h-7 w-7 items-center justify-center rounded-[6px] text-muted hover:bg-black/5 hover:text-ink disabled:opacity-40"
                >
                  {">"}
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
              {overdueCue > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    focusOverdueRef.current = true;
                    setView("list");
                  }}
                  className="ml-auto text-xs font-medium text-danger underline-offset-2 hover:underline"
                >
                  {overdueCue} overdue — List
                </button>
              )}
              {!overdueCue && hint && (
                <button
                  type="button"
                  onClick={() => jumpToMonth(hint.deadline)}
                  title="Jump to the next upcoming deadline"
                  className="ml-auto max-w-[55%] truncate text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
                >
                  Next: {hint.label}
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
              <div className="flex flex-col items-center gap-4 py-32">
                <p className="text-sm text-muted">
                  No deadlines yet. Paste a list to get started.
                </p>
                <button
                  type="button"
                  onClick={openCapture}
                  onPointerEnter={() => {
                    void import("@/components/CaptureModal");
                  }}
                  className="btn-press rounded-[6px] bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                >
                  Add deadlines
                </button>
              </div>
            ) : (
              <MonthCalendar
                cursor={cursor!}
                now={now}
                deadlines={deadlines}
                onEdit={openEdit}
                onDelete={removeDeadline}
                onToggle={(d) => patchDeadline(d.id, { done: !d.done })}
              />
            )}
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
            onEdit={openEdit}
            onToggle={(d) => patchDeadline(d.id, { done: !d.done })}
            onAdd={openCapture}
          />
        )}
      </main>

      {captureOpen && (
        <CaptureModal
          onClose={() => setCaptureOpen(false)}
          onManual={openManual}
          onDone={(msg) => {
            setCaptureOpen(false);
            setLoading(true);
            load({ jumpToNearest: true });
            showToast(msg);
          }}
        />
      )}

      {(editing || creating) && (
        <EditModal
          deadline={creating ? null : editing}
          onClose={closeEditModal}
          onSaved={(updated) => {
            if (creating) {
              setDeadlines((ds) => [...ds, updated]);
              closeEditModal();
              showToast("Added");
              load({ jumpToNearest: true });
            } else {
              setDeadlines((ds) =>
                ds.map((d) => (d.id === updated.id ? updated : d)),
              );
              closeEditModal();
              showToast("Saved");
            }
          }}
          onDeleted={
            creating
              ? undefined
              : (id) => {
                  setDeadlines((ds) => ds.filter((d) => d.id !== id));
                  closeEditModal();
                  showToast("Deleted");
                }
          }
        />
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="toast-enter fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-[8px] border border-hairline bg-canvas px-4 py-2 text-sm"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

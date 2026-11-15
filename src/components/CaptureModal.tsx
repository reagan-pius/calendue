"use client";

import { useState } from "react";
import {
  DEADLINE_TYPES,
  TYPE_LABELS,
  isDeadlineType,
} from "@/lib/deadlines/types";
import { combineLocal, dayKeyOf, splitIso } from "@/lib/dates";

interface CaptureModalProps {
  onClose: () => void;
  onDone: (toast: string) => void;
}

interface ReviewRow {
  raw: string;
  title: string;
  date: string;
  time: string;
  type: string;
  module: string;
  confidence: number;
  dropped: boolean;
}

const inputCls =
  "w-full rounded-[6px] border border-hairline bg-white px-2.5 py-1.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent";

function toastParts(auto: number, confirmed: number, cancelledReview: boolean) {
  const parts: string[] = [];
  if (auto > 0) parts.push(`${auto} added`);
  if (confirmed > 0) parts.push(`${confirmed} confirmed`);
  if (cancelledReview && auto > 0) parts.push("review cancelled");
  return parts.join(" · ") || "Nothing recognized";
}

// Spec capture modal: step 1 large textarea; step 2 editable review for
// uncertain items. High-confidence items may already be committed; dismiss
// always reports that honestly so the calendar can reload.
export default function CaptureModal({ onClose, onDone }: CaptureModalProps) {
  const [step, setStep] = useState<"input" | "review">("input");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAuto, setPendingAuto] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);

  function dismiss() {
    if (step === "review" && pendingAuto > 0) {
      onDone(toastParts(pendingAuto, 0, true));
      return;
    }
    onClose();
  }

  async function submitParse() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Parse failed");
      }
      const data = (await res.json()) as {
        autoCommit: unknown[];
        needsReview: { raw: string; title: string; due_at: string | null; type: string; module: string | null; confidence: number }[];
        parseSessionId: string | null;
      };
      if (data.needsReview.length === 0) {
        onDone(toastParts(data.autoCommit.length, 0, false));
        return;
      }
      setRows(
        data.needsReview.map((i) => {
          const parts = i.due_at ? splitIso(i.due_at) : { date: "", time: "" };
          return {
            raw: i.raw,
            title: i.title,
            date: i.due_at ? dayKeyOf(i.due_at) : parts.date,
            time: i.due_at ? parts.time : "",
            type: isDeadlineType(i.type) ? i.type : "assignment",
            module: i.module ?? "",
            confidence: i.confidence,
            dropped: false,
          };
        }),
      );
      setStep("review");
      setPendingAuto(data.autoCommit.length);
      setSessionId(data.parseSessionId ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Parse failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmReview() {
    setBusy(true);
    setError(null);
    try {
      const kept = rows.filter((r) => !r.dropped && r.date);
      if (kept.length === 0) {
        onDone(toastParts(pendingAuto, 0, false));
        return;
      }
      const results = await Promise.all(
        kept.map((r) =>
          fetch("/api/deadlines", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: r.title,
              due_at: combineLocal(r.date, r.time),
              type: r.type,
              module: r.module || null,
              source: "paste",
              parse_session_id: sessionId,
            }),
          }),
        ),
      );
      if (results.some((r) => !r.ok)) throw new Error("Could not save some items");
      onDone(toastParts(pendingAuto, kept.length, false));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function updateRow(idx: number, patch: Partial<ReviewRow>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  const needsDate = rows.some((r) => !r.dropped && !r.date);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default bg-black/20" onClick={dismiss} />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[12px] border border-hairline bg-canvas p-5 shadow-lg">
        <h3 className="mb-3 text-sm font-medium">
          {step === "input" ? "Add deadlines" : "Review uncertain items"}
        </h3>

        {step === "input" ? (
          <>
            <textarea
              autoFocus
              rows={7}
              placeholder={"Paste from Moodle or a chat, e.g.\nCS coursework 1 due 30 Oct\nMATH 201 exam Fri 2pm\nlab report due next friday"}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className={`${inputCls} resize-y font-mono text-[13px]`}
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" onClick={dismiss} className="rounded-[6px] border border-hairline px-3 py-1.5 text-sm text-muted transition-colors hover:text-ink">
                Cancel
              </button>
              <button
                type="button"
                onClick={submitParse}
                disabled={busy || !text.trim()}
                className="rounded-[6px] bg-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Parsing…" : "Add"}
              </button>
            </div>
          </>
        ) : (
          <>
            {pendingAuto > 0 && (
              <p className="mb-3 rounded-[6px] border border-hairline bg-canvas px-3 py-2 text-xs text-ink">
                {pendingAuto} already added to your calendar. Fix or drop the rest below.
              </p>
            )}
            <p className="mb-3 text-xs text-muted">
              Check the details below, then confirm. Drop anything wrong.
            </p>
            <ul className="flex flex-col gap-3">
              {rows.map((r, idx) => (
                <li
                  key={idx}
                  className={`rounded-[8px] border border-hairline p-3 ${r.dropped ? "opacity-40" : ""}`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] text-muted">“{r.raw}”</span>
                    <button
                      type="button"
                      onClick={() => updateRow(idx, { dropped: !r.dropped })}
                      className="shrink-0 text-[11px] text-muted underline-offset-2 hover:text-[#DC2626] hover:underline"
                    >
                      {r.dropped ? "Restore" : "Drop"}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <label className="col-span-2 block">
                      <span className="mb-1 block text-[11px] text-muted">Title</span>
                      <input className={inputCls} value={r.title} onChange={(e) => updateRow(idx, { title: e.target.value })} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] text-muted">Date</span>
                      <input type="date" className={inputCls} value={r.date} onChange={(e) => updateRow(idx, { date: e.target.value })} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] text-muted">Time</span>
                      <input type="time" className={inputCls} value={r.time} onChange={(e) => updateRow(idx, { time: e.target.value })} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] text-muted">Type</span>
                      <select className={inputCls} value={r.type} onChange={(e) => updateRow(idx, { type: e.target.value })}>
                        {DEADLINE_TYPES.map((t) => (
                          <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                        ))}
                      </select>
                    </label>
                    <label className="col-span-2 block sm:col-span-1">
                      <span className="mb-1 block text-[11px] text-muted">Module</span>
                      <input className={inputCls} value={r.module} onChange={(e) => updateRow(idx, { module: e.target.value })} />
                    </label>
                    {!r.date && !r.dropped && (
                      <span className="self-end pb-1.5 text-[11px] font-medium text-[#DC2626]">Needs date</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {needsDate && (
              <p className="mt-2 text-[11px] text-[#DC2626]">Every kept row needs a date.</p>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" onClick={dismiss} className="rounded-[6px] border border-hairline px-3 py-1.5 text-sm text-muted transition-colors hover:text-ink">
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmReview}
                disabled={busy || needsDate}
                className="rounded-[6px] bg-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Confirm"}
              </button>
            </div>
          </>
        )}

        {error && <p className="mt-3 text-xs text-[#DC2626]">{error}</p>}
      </div>
    </div>
  );
}

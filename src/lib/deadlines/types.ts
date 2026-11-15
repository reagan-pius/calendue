// Shared deadline types + palette (spec D5: color stored as #RRGGBB hex,
// defaults by type; type colors appear only on chips/dots, never chrome).
export const DEADLINE_TYPES = [
  "assignment",
  "exam",
  "meeting",
  "personal",
  "reminder",
] as const;

export type DeadlineType = (typeof DEADLINE_TYPES)[number];

export const TYPE_COLORS: Record<DeadlineType, string> = {
  assignment: "#DC2626",
  exam: "#EA580C",
  meeting: "#2563EB",
  personal: "#16A34A",
  reminder: "#6B7280",
};

export const TYPE_LABELS: Record<DeadlineType, string> = {
  assignment: "Assignment",
  exam: "Exam",
  meeting: "Meeting",
  personal: "Personal",
  reminder: "Reminder",
};

export function isDeadlineType(value: string): value is DeadlineType {
  return (DEADLINE_TYPES as readonly string[]).includes(value);
}

export interface Deadline {
  id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  type: DeadlineType;
  module: string | null;
  color: string | null;
  done: boolean;
}

// Shared select list for calendar/list surfaces. Keeps payloads lean —
// parse_confidence / parse_session_id stay on the server for calibration.
export const DEADLINE_COLUMNS =
  "id, title, description, due_at, type, module, color, done, source";

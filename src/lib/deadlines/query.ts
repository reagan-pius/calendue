// Shared select list for calendar/list surfaces. Keeps payloads lean —
// parse_confidence / parse_session_id / source stay on the server.
export const DEADLINE_COLUMNS =
  "id, title, description, due_at, type, module, color, done";

// Shared select lists. List/calendar omit description; edit/create returns
// include it. parse_confidence / parse_session_id / source stay on the server.
export const DEADLINE_LIST_COLUMNS =
  "id, title, due_at, type, module, color, done";

export const DEADLINE_COLUMNS =
  "id, title, description, due_at, type, module, color, done";

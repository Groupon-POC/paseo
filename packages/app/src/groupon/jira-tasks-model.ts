// Added for Groupon Desk (fork of Paseo, Apache-2.0): My tasks on the New workspace page, as plain data.

/**
 * The New workspace page's My tasks card: a filter bar modelled on Jira's (Assignee = Current user,
 * Type, Status, Created in the last N days, More filters as free JQL, Clear filters), the person's
 * columns (Jira's own nine by default) and paging. The filter bar writes one JQL; the saved view
 * keeps that JQL and the columns, and reading it back fills the bar again, anything the bar does
 * not draw landing in More filters. Pure, so the round trip is tested without a screen.
 */

export interface JiraFilters {
  /** `assignee = currentUser()`. */
  mine: boolean;
  /** Work type names, `Task`; empty is any. */
  types: string[];
  /** Status names, `To Do`; empty is any. */
  statuses: string[];
  /** `created >= -<n>d`; null is any time. */
  createdWithinDays: number | null;
  /** Free JQL the bar does not draw, an `ORDER BY` included. */
  more: string;
}

/** What the card opens with for a person who never changed it: Jira's "my open work" of the last month. */
export const DEFAULT_FILTERS: JiraFilters = {
  mine: true,
  types: [],
  statuses: ["To Do"],
  createdWithinDays: 30,
  more: "",
};

/** Clear filters: no clause of the bar's own; the platform still limits the search to its scope. */
export const CLEARED_FILTERS: JiraFilters = {
  mine: false,
  types: [],
  statuses: [],
  createdWithinDays: null,
  more: "",
};

/** Jira's own list: Work type, Work item key, Summary, Status, Created, Assignee, Original estimate, Parent, Labels. */
export const DEFAULT_COLUMNS: readonly string[] = [
  "issuetype",
  "issuekey",
  "summary",
  "status",
  "created",
  "assignee",
  "timeoriginalestimate",
  "parent",
  "labels",
];

/** Newest first, as Jira's list opens; never left out, so the query is never empty. */
export const DEFAULT_ORDER = "created DESC";
export const PAGE_SIZE = 25;
/** A change is saved as the person's default once they stop changing things for this long. */
export const SAVE_DELAY_MS = 800;

export const TYPE_CHOICES: readonly string[] = ["Task", "Bug", "Story", "Epic", "Sub-task"];
export const STATUS_CHOICES: readonly string[] = ["To Do", "In Progress", "In Review", "Done"];
export const CREATED_CHOICES: readonly (number | null)[] = [7, 14, 30, 90, null];

// ---- JQL, written ----------------------------------------------------------------------------

export function jqlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

const listClause = (field: string, values: string[]) =>
  `${field} in (${values.map(jqlString).join(", ")})`;

/** The bar as one JQL: its clauses AND the free part in parentheses, then the order. */
export function filtersToJql(filters: JiraFilters): string {
  const { where, orderBy } = splitJql(filters.more);
  const clauses: string[] = [];
  if (filters.mine) clauses.push("assignee = currentUser()");
  if (filters.types.length > 0) clauses.push(listClause("type", filters.types));
  if (filters.statuses.length > 0) clauses.push(listClause("status", filters.statuses));
  if (filters.createdWithinDays !== null) clauses.push(`created >= -${filters.createdWithinDays}d`);
  if (where) clauses.push(clauses.length > 0 ? `(${where})` : where);
  const order = `ORDER BY ${orderBy ?? DEFAULT_ORDER}`;
  return clauses.length > 0 ? `${clauses.join(" AND ")} ${order}` : order;
}

// ---- JQL, read back --------------------------------------------------------------------------

interface Scan {
  /** Character offsets of each top-level ` AND ` (the space before it). */
  ands: { start: number; end: number }[];
  hasTopLevelOr: boolean;
  orderAt: number | null;
}

const WORD = /[A-Za-z0-9_]/;

/** One pass over the text: quoted text and parentheses skipped, the top-level words found. */
function scan(text: string): Scan {
  const result: Scan = { ands: [], hasTopLevelOr: false, orderAt: null };
  let depth = 0;
  let quote: string | null = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    if (depth !== 0 || WORD.test(text.charAt(index - 1))) continue;
    const rest = text.slice(index);
    const and = /^and\s/i.exec(rest);
    if (and && /\s/.test(text.charAt(index - 1)))
      result.ands.push({ start: index, end: index + and[0].length });
    if (/^or\s/i.test(rest) && /\s/.test(text.charAt(index - 1))) result.hasTopLevelOr = true;
    if (/^order\s+by\b/i.test(rest) && result.orderAt === null) result.orderAt = index;
  }
  return result;
}

/** The filter and the order of a JQL; the order null when it has none. */
export function splitJql(jql: string): { where: string; orderBy: string | null } {
  const text = jql.trim();
  const { orderAt } = scan(text);
  if (orderAt === null) return { where: text, orderBy: null };
  const orderBy = text
    .slice(orderAt)
    .replace(/^order\s+by\s*/i, "")
    .trim();
  return { where: text.slice(0, orderAt).trim(), orderBy: orderBy || null };
}

/** The top-level AND parts of a filter, or the whole filter when it has a top-level OR. */
function andParts(where: string): string[] {
  if (!where) return [];
  const { ands, hasTopLevelOr } = scan(where);
  if (hasTopLevelOr) return [where];
  const parts: string[] = [];
  let from = 0;
  for (const and of ands) {
    parts.push(where.slice(from, and.start).trim());
    from = and.end;
  }
  parts.push(where.slice(from).trim());
  return parts.filter((part) => part.length > 0);
}

/** Commas outside quoted text. */
function commaSplit(inner: string): string[] {
  const items: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (let index = 0; index < inner.length; index += 1) {
    const char = inner.charAt(index);
    if (quote) {
      current += char;
      if (char === "\\" && index + 1 < inner.length) {
        current += inner.charAt(index + 1);
        index += 1;
      } else if (char === quote) quote = null;
    } else if (char === ",") {
      items.push(current.trim());
      current = "";
    } else {
      if (char === '"' || char === "'") quote = char;
      current += char;
    }
  }
  items.push(current.trim());
  return items;
}

/** `"To Do", Task` as values, quotes taken off; null when the list is not one the bar wrote. */
function listValues(inner: string): string[] | null {
  const values: string[] = [];
  for (const item of commaSplit(inner)) {
    const quoted = /^(["'])((?:\\.|(?!\1).)*)\1$/.exec(item);
    if (quoted) values.push((quoted[2] ?? "").replace(/\\(.)/g, "$1"));
    else if (/^[^()"',]+$/.test(item)) values.push(item);
    else return null;
  }
  return values.length > 0 && values.every((value) => value.length > 0) ? values : null;
}

function valuesOf(part: string, fields: string): string[] | null {
  const inList = new RegExp(`^(?:${fields})\\s+in\\s*\\((.*)\\)$`, "i").exec(part);
  if (inList) return listValues(inList[1] ?? "");
  const equals = new RegExp(`^(?:${fields})\\s*=\\s*(.+)$`, "i").exec(part);
  return equals ? listValues(equals[1] ?? "") : null;
}

/** A part wrapped whole in one pair of parentheses, unwrapped; the part itself otherwise. */
function unwrapped(part: string): string {
  if (!part.startsWith("(") || !part.endsWith(")")) return part;
  const inner = part.slice(1, -1);
  let depth = 0;
  let quote: string | null = null;
  for (let index = 0; index < inner.length; index += 1) {
    const char = inner.charAt(index);
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth < 0) return part;
    }
  }
  return depth === 0 ? inner.trim() : part;
}

/** The bar filled from a JQL: each clause it draws taken once, the rest into More filters. */
export function jqlToFilters(jql: string): JiraFilters {
  const { where, orderBy } = splitJql(jql);
  let mine = false;
  let types: string[] | null = null;
  let statuses: string[] | null = null;
  let createdWithinDays: number | null = null;
  const rest: string[] = [];
  for (const part of andParts(where)) {
    const created = /^created\s*>=\s*-(\d{1,4})d$/i.exec(part);
    const typeValues: string[] | null = types ? null : valuesOf(part, "type|issuetype");
    const statusValues: string[] | null = statuses ? null : valuesOf(part, "status");
    if (!mine && /^assignee\s*=\s*currentUser\s*\(\s*\)$/i.test(part)) mine = true;
    else if (typeValues) types = typeValues;
    else if (statusValues) statuses = statusValues;
    else if (created && createdWithinDays === null) createdWithinDays = Number(created[1]);
    else rest.push(part);
  }
  // One free part loses its own parentheses; several keep theirs, so an OR inside one stays inside it.
  const freeWhere = rest.length === 1 ? unwrapped(rest[0] ?? "") : rest.join(" AND ");
  const order = orderBy && orderBy.toLowerCase() !== DEFAULT_ORDER.toLowerCase() ? orderBy : null;
  return {
    mine,
    types: types ?? [],
    statuses: statuses ?? [],
    createdWithinDays,
    more: [freeWhere, order ? `ORDER BY ${order}` : ""].filter(Boolean).join(" "),
  };
}

// ---- The saved view --------------------------------------------------------------------------

export interface SavedView {
  jql: string;
  columns: string[];
}

export interface TasksState {
  filters: JiraFilters;
  columns: string[];
}

/** The card's state from the saved view; Jira's defaults for a person who has none. */
export function stateFromView(view: SavedView | null): TasksState {
  if (!view) return { filters: DEFAULT_FILTERS, columns: [...DEFAULT_COLUMNS] };
  return {
    filters: jqlToFilters(view.jql),
    columns: view.columns.length > 0 ? view.columns : [...DEFAULT_COLUMNS],
  };
}

export function viewFromState(state: TasksState): SavedView {
  return { jql: filtersToJql(state.filters), columns: state.columns };
}

export function sameFilters(a: JiraFilters, b: JiraFilters): boolean {
  return filtersToJql(a) === filtersToJql(b);
}

// ---- The bar's pills -------------------------------------------------------------------------

/** One choice switched on or off in a multi-select pill. */
export function toggled(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

/** The pill's choices: the usual ones, then any the person picked or the page showed. */
export function choicesWith(
  base: readonly string[],
  ...more: readonly (readonly string[])[]
): string[] {
  const all = [...base];
  for (const list of more)
    for (const value of list) if (value && !all.includes(value)) all.push(value);
  return all;
}

export function listLabel(name: string, values: readonly string[]): string {
  return values.length > 0 ? `${name} = ${values.join(", ")}` : name;
}

export function createdLabel(days: number | null): string {
  return days === null ? "Created: any time" : `Created in the last ${days} days`;
}

export function assigneeLabel(mine: boolean): string {
  return mine ? "Assignee = Current user" : "Assignee: anyone";
}

// ---- The columns -----------------------------------------------------------------------------

/** A column on or off; one switched on joins at the end, the last column (Take to development) stays last. */
export function toggledColumn(columns: readonly string[], id: string): string[] {
  if (!columns.includes(id)) return [...columns, id];
  const left = columns.filter((column) => column !== id);
  return left.length > 0 ? left : [...columns];
}

export function sameColumns(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => b[index] === id);
}

export interface FieldChoice {
  id: string;
  name: string;
}

/** The column picker's list: the fields whose name or id holds the search, the shown ones first. */
export function pickerFields(
  fields: readonly FieldChoice[],
  columns: readonly string[],
  search: string,
): FieldChoice[] {
  const needle = search.trim().toLowerCase();
  const matching = needle
    ? fields.filter(
        (field) =>
          field.name.toLowerCase().includes(needle) || field.id.toLowerCase().includes(needle),
      )
    : [...fields];
  const shown = matching.filter((field) => columns.includes(field.id));
  shown.sort((a, b) => columns.indexOf(a.id) - columns.indexOf(b.id));
  return [...shown, ...matching.filter((field) => !columns.includes(field.id))];
}

/** How wide a column draws, by what its cells hold. */
export function columnWidth(id: string, kind: string): number {
  if (id === "summary") return 360;
  const widths: Record<string, number> = {
    key: 110,
    issue: 240,
    user: 160,
    status: 130,
    option: 110,
    datetime: 120,
    date: 120,
    duration: 100,
    number: 90,
    list: 170,
  };
  return widths[kind] ?? 170;
}

/** A cell's text as the window shows it: a moment or a date as the person's own date. */
export function cellText(text: string, kind: string): string {
  if (kind !== "datetime" && kind !== "date") return text;
  const parsed = new Date(kind === "date" ? `${text}T00:00:00` : text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// ---- Paging ----------------------------------------------------------------------------------

/** The cursors of the pages walked so far; the last one is the page shown (null: the first page). */
export type PageTrail = readonly (string | null)[];

export const FIRST_PAGE: PageTrail = [null];

export function nextPage(trail: PageTrail, nextCursor: string | null): PageTrail {
  return nextCursor ? [...trail, nextCursor] : trail;
}

export function previousPage(trail: PageTrail): PageTrail {
  return trail.length > 1 ? trail.slice(0, -1) : trail;
}

/** "26-50 of about 151", or "26-50" when Jira gave no count. */
export function pageRangeText(trail: PageTrail, rows: number, total: number | null): string {
  if (rows === 0) return "";
  const from = (trail.length - 1) * PAGE_SIZE + 1;
  const range = `${from}-${from + rows - 1}`;
  return total === null ? range : `${range} of about ${total}`;
}

// ---- What the card says when it has no rows --------------------------------------------------

export type TasksProblem =
  | { kind: "signed-out"; message: string }
  | { kind: "plugin-old"; message: string }
  | { kind: "failed"; message: string };

/** The plugin's own problem, or a failed call in the person's words. */
export function problemFrom(
  answer: { kind: "signed-out" | "failed"; message: string } | null,
  error: string | null,
): TasksProblem | null {
  if (answer) return answer;
  if (!error) return null;
  if (/does not contribute RPC|older than this app/.test(error)) {
    return {
      kind: "plugin-old",
      message:
        "The Groupon plugin on this Mac is older than this window: update Groupon Desk there, or restart groupon desk serve.",
    };
  }
  return { kind: "failed", message: error };
}

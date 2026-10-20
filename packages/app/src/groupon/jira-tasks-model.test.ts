// Added for Groupon Desk (fork of Paseo, Apache-2.0): My tasks' filter bar, saved view, columns and paging.
import { describe, expect, it } from "vitest";
import {
  CLEARED_FILTERS,
  DEFAULT_COLUMNS,
  DEFAULT_FILTERS,
  FIRST_PAGE,
  filtersToJql,
  jqlToFilters,
  nextPage,
  pageRangeText,
  pickerFields,
  previousPage,
  problemFrom,
  splitJql,
  stateFromView,
  toggledColumn,
  viewFromState,
  type JiraFilters,
} from "./jira-tasks-model";

describe("filtersToJql", () => {
  it("writes Jira's default bar as one query, newest first", () => {
    expect(filtersToJql(DEFAULT_FILTERS)).toBe(
      'assignee = currentUser() AND status in ("To Do") AND created >= -30d ORDER BY created DESC',
    );
  });

  it("puts More filters in its own parentheses and takes its order", () => {
    const filters: JiraFilters = {
      ...DEFAULT_FILTERS,
      types: ["Task", "Bug"],
      more: "labels = cli OR priority = High ORDER BY priority DESC",
    };

    expect(filtersToJql(filters)).toBe(
      'assignee = currentUser() AND type in ("Task", "Bug") AND status in ("To Do") AND created >= -30d AND (labels = cli OR priority = High) ORDER BY priority DESC',
    );
  });

  it("never writes an empty query: cleared filters still order", () => {
    expect(filtersToJql(CLEARED_FILTERS)).toBe("ORDER BY created DESC");
  });

  it("quotes a value the way JQL reads it back", () => {
    expect(filtersToJql({ ...CLEARED_FILTERS, statuses: ['Say "hi"'] })).toBe(
      'status in ("Say \\"hi\\"") ORDER BY created DESC',
    );
  });
});

describe("jqlToFilters", () => {
  it.each([
    { label: "the default bar", filters: DEFAULT_FILTERS },
    { label: "cleared filters", filters: CLEARED_FILTERS },
    {
      label: "every pill and a free part with an OR",
      filters: {
        mine: true,
        types: ["Task", "Sub-task"],
        statuses: ["To Do", "In Progress"],
        createdWithinDays: 7,
        more: "labels = cli OR priority = High ORDER BY updated DESC",
      },
    },
    {
      label: "a value with a quote and a comma",
      filters: { ...CLEARED_FILTERS, statuses: ['Waiting, "QA"'] },
    },
  ])("reads back what the bar wrote: $label", ({ filters }) => {
    expect(jqlToFilters(filtersToJql(filters))).toEqual(filters);
  });

  it("fills the pills from a query typed elsewhere and keeps the rest as More filters", () => {
    const filters = jqlToFilters(
      'project = ENC AND assignee = currentUser() AND issuetype = Bug AND status = "In Review"',
    );

    expect(filters).toEqual({
      mine: true,
      types: ["Bug"],
      statuses: ["In Review"],
      createdWithinDays: null,
      more: "project = ENC",
    });
  });

  it("keeps a query with a top-level OR whole, so its meaning never changes", () => {
    expect(jqlToFilters("assignee = currentUser() OR reporter = currentUser()")).toEqual({
      ...CLEARED_FILTERS,
      more: "assignee = currentUser() OR reporter = currentUser()",
    });
  });

  it("does not split on an AND inside quotes or parentheses", () => {
    const typed = 'summary ~ "this AND that" AND (a = 1 AND b = 2)';

    expect(jqlToFilters(typed).more).toBe(typed);
  });
});

describe("splitJql", () => {
  it("finds the order outside quoted text only", () => {
    expect(splitJql('summary ~ "ORDER BY" ORDER BY key ASC')).toEqual({
      where: 'summary ~ "ORDER BY"',
      orderBy: "key ASC",
    });
  });
});

describe("the saved view", () => {
  it("opens on Jira's defaults for a person who never saved one", () => {
    expect(stateFromView(null)).toEqual({ filters: DEFAULT_FILTERS, columns: DEFAULT_COLUMNS });
  });

  it("round-trips: the state saved is the state read back", () => {
    const state = {
      filters: { ...DEFAULT_FILTERS, types: ["Bug"], more: "labels = cli" },
      columns: ["issuekey", "summary", "customfield_10105"],
    };

    expect(stateFromView(viewFromState(state))).toEqual(state);
  });

  it("falls back to the default columns when the saved list is empty", () => {
    expect(stateFromView({ jql: "", columns: [] }).columns).toEqual(DEFAULT_COLUMNS);
  });
});

describe("the columns", () => {
  it("has Jira's nine by default, work type first", () => {
    expect(DEFAULT_COLUMNS).toEqual([
      "issuetype",
      "issuekey",
      "summary",
      "status",
      "created",
      "assignee",
      "timeoriginalestimate",
      "parent",
      "labels",
    ]);
  });

  it("adds a column at the end, takes one off, and never leaves none", () => {
    expect(toggledColumn(["summary"], "labels")).toEqual(["summary", "labels"]);
    expect(toggledColumn(["summary", "labels"], "summary")).toEqual(["labels"]);
    expect(toggledColumn(["summary"], "summary")).toEqual(["summary"]);
  });

  it("lists the shown fields first, in their order, then the rest matching the search", () => {
    const fields = [
      { id: "labels", name: "Labels" },
      { id: "customfield_10105", name: "Sprint" },
      { id: "summary", name: "Summary" },
      { id: "status", name: "Status" },
    ];

    expect(pickerFields(fields, ["summary", "labels"], "").map((field) => field.id)).toEqual([
      "summary",
      "labels",
      "customfield_10105",
      "status",
    ]);
    expect(pickerFields(fields, [], "S").map((field) => field.id)).toEqual([
      "labels",
      "customfield_10105",
      "summary",
      "status",
    ]);
    expect(pickerFields(fields, [], "sprint").map((field) => field.id)).toEqual([
      "customfield_10105",
    ]);
  });
});

describe("paging", () => {
  it("walks forward on the next page's cursor and back again", () => {
    const second = nextPage(FIRST_PAGE, "tok-2");

    expect(second).toEqual([null, "tok-2"]);
    expect(nextPage(second, null)).toBe(second);
    expect(previousPage(second)).toEqual([null]);
    expect(previousPage(FIRST_PAGE)).toBe(FIRST_PAGE);
  });

  it("says which rows show, with Jira's estimate when it gave one", () => {
    expect(pageRangeText([null, "tok-2"], 25, 151)).toBe("26-50 of about 151");
    expect(pageRangeText(FIRST_PAGE, 3, null)).toBe("1-3");
    expect(pageRangeText(FIRST_PAGE, 0, 0)).toBe("");
  });
});

describe("problemFrom", () => {
  it("tells a plugin older than the window from a signed-out CLI and any other failure", () => {
    expect(
      problemFrom(
        null,
        "The Groupon plugin on this Mac is older than this app: restart groupon desk serve there.",
      )?.kind,
    ).toBe("plugin-old");
    expect(problemFrom({ kind: "signed-out", message: "run groupon login" }, null)?.kind).toBe(
      "signed-out",
    );
    expect(problemFrom(null, "Jira did not answer")).toEqual({
      kind: "failed",
      message: "Jira did not answer",
    });
    expect(problemFrom(null, null)).toBeNull();
  });
});

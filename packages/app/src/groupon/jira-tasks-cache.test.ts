// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for My tasks kept on this device.

import { describe, expect, it } from "vitest";
import type { JiraSearchPage } from "./desk-plugin-rpc";
import { keptPages, tasksPageKey } from "./jira-tasks-cache";

const page = (jql: string): JiraSearchPage => ({
  data: [{ key: "ENC-1", url: "https://jira/ENC-1", cells: {} }],
  nextCursor: null,
  total: 1,
  fields: [],
  jql,
});

describe("My tasks kept on this device", () => {
  it("keeps a page under its Mac, query, columns and place, apart from any other", () => {
    const first = tasksPageKey({ serverId: "s", jql: "a", columns: ["key"], cursor: null });
    expect(first).not.toBe(
      tasksPageKey({ serverId: "s", jql: "a", columns: ["key"], cursor: "2" }),
    );
    expect(first).not.toBe(
      tasksPageKey({ serverId: "t", jql: "a", columns: ["key"], cursor: null }),
    );
  });

  it("keeps the newest eight pages read, the oldest leaving first", () => {
    let pages = {};
    for (let index = 0; index < 10; index += 1) {
      pages = keptPages(pages, `k${index}`, page(`q${index}`), 1000 + index);
    }

    expect(Object.keys(pages).sort()).toEqual(["k2", "k3", "k4", "k5", "k6", "k7", "k8", "k9"]);
  });
});

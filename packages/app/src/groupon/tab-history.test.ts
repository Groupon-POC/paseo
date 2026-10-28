// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for going back and forward through a workspace's tabs.

import { describe, expect, it } from "vitest";
import { EMPTY_TAB_HISTORY, recordTab, stepTab } from "./tab-history";

const all = () => true;

describe("back and forward through a workspace's tabs", () => {
  it("goes back to the chat a file was opened from, and forward to the file again", () => {
    let history = recordTab(recordTab(EMPTY_TAB_HISTORY, "chat"), "file");
    const back = stepTab(history, -1, all);
    expect(back?.tabId).toBe("chat");
    history = back!.history;
    // Showing the tab it went back to records nothing new.
    expect(recordTab(history, "chat")).toBe(history);
    expect(stepTab(history, 1, all)?.tabId).toBe("file");
    expect(stepTab(history, -1, all)).toBeNull();
  });

  it("drops what lay ahead once a new tab is shown after going back, as a browser does", () => {
    let history = recordTab(recordTab(recordTab(EMPTY_TAB_HISTORY, "a"), "b"), "c");
    history = stepTab(history, -1, all)!.history;
    history = recordTab(history, "d");

    expect(history.entries).toEqual(["a", "b", "d"]);
    expect(stepTab(history, 1, all)).toBeNull();
  });

  it("skips a tab closed since", () => {
    const history = recordTab(recordTab(recordTab(EMPTY_TAB_HISTORY, "a"), "closed"), "c");

    expect(stepTab(history, -1, (tabId) => tabId !== "closed")?.tabId).toBe("a");
  });
});

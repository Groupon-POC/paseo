// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for the chat's display modes, the git timeline in Live included.

import { describe, expect, it } from "vitest";
import type { StreamItem } from "@/types/stream";
import { filterForDisplayMode, liveItemOf } from "./display-mode";

const at = new Date("2026-10-27T12:00:00Z");

function tool(id: string, status: string): StreamItem {
  return {
    kind: "tool_call",
    id,
    timestamp: at,
    payload: { source: "agent", data: { status } },
  } as unknown as StreamItem;
}

function thought(id: string, status: "loading" | "ready"): StreamItem {
  return { kind: "thought", id, text: "…", timestamp: at, status };
}

function message(id: string): StreamItem {
  return { kind: "assistant_message", id, text: "done", timestamp: at } as unknown as StreamItem;
}

const STREAM: StreamItem[] = [
  message("m1"),
  thought("t-done", "ready"),
  tool("ok", "completed"),
  tool("bad", "failed"),
  tool("live", "running"),
  thought("t-live", "loading"),
];

const ids = (items: StreamItem[]) => items.map((item) => item.id);

function commit(id: string, status: string): StreamItem {
  return {
    kind: "tool_call",
    id,
    timestamp: at,
    payload: {
      source: "agent",
      data: { status, detail: { type: "shell", command: 'git commit -m "x"', output: "" } },
    },
  } as unknown as StreamItem;
}

describe("chat display modes", () => {
  it("Live keeps a finished commit or push on the git timeline, never one that still runs", () => {
    const items = [message("m1"), commit("done", "completed"), commit("running", "running")];
    expect(ids(filterForDisplayMode(items, "live"))).toEqual(["m1", "done"]);
    expect(ids(filterForDisplayMode(items, "output"))).toEqual(["m1"]);
  });

  it("All shows every row", () => {
    expect(filterForDisplayMode(STREAM, "all")).toBe(STREAM);
  });

  it("Live never adds a row for what runs now, so the list does not jump; failed calls stay", () => {
    expect(ids(filterForDisplayMode(STREAM, "live"))).toEqual(["m1", "bad"]);
  });

  it("Live keeps a question the person answered", () => {
    const answered = {
      kind: "tool_call",
      id: "q",
      timestamp: at,
      payload: { source: "agent", data: { name: "AskUserQuestion", status: "completed" } },
    } as unknown as StreamItem;

    expect(ids(filterForDisplayMode([message("m1"), answered], "live"))).toEqual(["m1", "q"]);
    expect(ids(filterForDisplayMode([message("m1"), answered], "output"))).toEqual(["m1"]);
  });

  it("Live drops the failed calls once the person turns them off", () => {
    expect(ids(filterForDisplayMode(STREAM, "live", false))).toEqual(["m1"]);
    expect(filterForDisplayMode(STREAM, "all", false)).toBe(STREAM);
  });

  it("Output only shows the messages", () => {
    expect(ids(filterForDisplayMode(STREAM, "output"))).toEqual(["m1"]);
  });
});

describe("Live's slot of what runs now", () => {
  it("holds the latest running call, else a streaming thought, else nothing", () => {
    const live = tool("live", "running");
    const thinking = thought("t", "loading");

    expect(liveItemOf([message("m1"), live])).toBe(live);
    expect(liveItemOf([live, thinking])).toBe(thinking);
    expect(liveItemOf([message("m1"), tool("ok", "completed")])).toBeNull();
  });
});

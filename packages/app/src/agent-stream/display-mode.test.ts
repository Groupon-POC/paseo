// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for the chat's display modes.

import { describe, expect, it } from "vitest";
import type { StreamItem } from "@/types/stream";
import { filterForDisplayMode } from "./display-mode";

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

describe("chat display modes", () => {
  it("All shows every row", () => {
    expect(filterForDisplayMode(STREAM, "all", true)).toBe(STREAM);
  });

  it("Fluent shows the running call, the live thought and the failed calls during a turn", () => {
    expect(ids(filterForDisplayMode(STREAM, "fluent", true))).toEqual([
      "m1",
      "bad",
      "live",
      "t-live",
    ]);
  });

  it("Fluent keeps only the failed calls once the turn is over", () => {
    expect(ids(filterForDisplayMode(STREAM, "fluent", false))).toEqual(["m1", "bad"]);
  });

  it("Output only shows the messages", () => {
    expect(ids(filterForDisplayMode(STREAM, "output", true))).toEqual(["m1"]);
  });
});

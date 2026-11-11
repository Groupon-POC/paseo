// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for Paseo's Create PR on the ticket standard.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  paseoCreateRefusal,
  readDeskTicketStandard,
  ticketStandardRefusal,
} from "./ticket-pull-request.js";

let root: string;

function git(...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
}

function writeDeskToml(text: string): void {
  mkdirSync(join(root, ".groupon"), { recursive: true });
  writeFileSync(join(root, ".groupon", "desk.toml"), text);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "groupon-ticket-pr-"));
  git("init", "-q", "-b", "staging");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("Paseo's own Create PR in a repository on the ticket standard", () => {
  test("refuses a branch without a ticket, the way PR 515 was opened", async () => {
    writeDeskToml('[git]\ntarget_branch = "staging"\npull_requests = "ticket"\n');
    git("switch", "-q", "-c", "ctzaruba/tenhle-ukol-nesouvisi-s-ukolem-v-tomto");

    const refusal = await ticketStandardRefusal(async (args) => git(...args));

    expect(refusal).toMatch(/groupon ticket pr/);
  });

  test("refuses a branch on the standard too: the title then comes from the ticket, not the diff", () => {
    expect(
      paseoCreateRefusal({ onTicketStandard: true, branch: "b2b/QR-1742/ENC-1234-fix" }),
    ).not.toBeNull();
  });

  test.each(["baseline-sync/2026-11-11", "release/2026-11-11"])(
    "leaves the exempt branch %s to Paseo",
    (branch) => {
      expect(paseoCreateRefusal({ onTicketStandard: true, branch })).toBeNull();
    },
  );

  test("leaves a repository off the standard, or without the file, to Paseo", async () => {
    git("switch", "-q", "-c", "ctzaruba/anything");
    expect(await ticketStandardRefusal(async (args) => git(...args))).toBeNull();

    writeDeskToml('[git]\ntarget_branch = "staging"\n');
    expect(readDeskTicketStandard(root)).toBe(false);
    expect(await ticketStandardRefusal(async (args) => git(...args))).toBeNull();
  });

  test("reads only the exact value", () => {
    writeDeskToml('[git]\npull_requests = "tickets"\n');
    expect(readDeskTicketStandard(root)).toBe(false);
    writeDeskToml('[git]\npull_requests = "ticket"\n');
    expect(readDeskTicketStandard(root)).toBe(true);
  });
});

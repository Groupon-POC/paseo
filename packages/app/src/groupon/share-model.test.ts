// Added for Groupon Desk (fork of Paseo, Apache-2.0): the shared-workspace model against the CLI's box; the sealed prompt names its device; the hub row of a window-made workspace by its daemon ids.
import { describe, expect, it } from "vitest";
import { bytesToBase64, identityFromVaultKey, openSealedJson, sealKeyFromShareKey } from "./crypto";
import type { OpenedMessage } from "./history";
import type { HubOverview, HubSharedWorkspace, HubWorkspace } from "./hub";
import {
  hubWorkspaceForDaemon,
  hubWorkspaceForPath,
  normaliseEmail,
  openPermissionRequests,
  sealPrompt,
  sharedKeyOf,
  sharedTree,
  sharedWorkspaceOfChat,
  sharesOfWorkspace,
} from "./share-model";

// The monorepo's packages/groupon-cli/tests/hand/share-seal.test.ts VECTOR (owner vault key 32 x 1,
// colleague 32 x 2, the share key 32 x 9, workspace "w-vector", version 3).
const OWNER_PUBLIC = "ctY2jnarD8Yu8ffmd1i0k4DyGMG4oCltpfy7qY0Eo1o=";
const BOX =
  "EQpnBpjpeoN2VwTkqlHuyRyVNU9O01AbT4kD4LSwfIbBP1J1fhSxN7GEltiwMOwiwGU8WKJ/ItM0qwJM4WrXqB0AJL++jghYzY/3oTKKw2HdvID2dbfK9Q4QXh+N298L8iBbE6Yh4Vw5bFgXcBXr8O3GWUTREJEnUyutZl6dPg2HwqsVkHBgHas=";

const colleague = identityFromVaultKey(new Uint8Array(32).fill(2));

function shared(overrides: Partial<HubSharedWorkspace> = {}): HubSharedWorkspace {
  return {
    shareId: "s1",
    role: "write",
    sealedShareKey: BOX,
    shareKeyVersion: 3,
    owner: { userId: "u1", name: "Olga Owner", email: "olga@groupon.com", publicKey: OWNER_PUBLIC },
    repositoryName: "engineering-development",
    workspace: {
      id: "w-vector",
      machine: "mac-a",
      branch: "olga/cart",
      targetBranch: "staging",
      ticketKey: "ENC-1",
      name: "Fix the cart",
      state: "ready",
      status: "idle",
      updatedAt: "2026-10-19T20:00:00Z",
    },
    chats: [
      {
        id: "ch-old",
        workspaceId: "w-vector",
        machine: "mac-a",
        agent: "claude",
        title: null,
        model: "claude-haiku-4-5",
        effort: null,
        status: "idle",
        lastMessageAt: "2026-10-19T18:00:00Z",
        createdAt: "2026-10-19T17:00:00Z",
      },
      {
        id: "ch-new",
        workspaceId: "w-vector",
        machine: "mac-a",
        agent: "claude",
        title: "Rounding",
        model: "claude-opus-5-5",
        effort: "high",
        status: "working",
        lastMessageAt: "2026-10-19T19:00:00Z",
        createdAt: "2026-10-19T18:30:00Z",
      },
    ],
    sharedAt: "2026-10-19T19:30:00Z",
    ...overrides,
  };
}

const overview = (overrides: Partial<HubOverview> = {}): HubOverview => ({
  repositories: [],
  workspaces: [],
  chats: [],
  machines: [],
  ...overrides,
});

describe("Shared with me", () => {
  it("lists each shared workspace with its owner, role and chats, the newest chat first", () => {
    expect(sharedTree(overview({ sharedWithMe: [shared()] }))).toEqual([
      {
        shareId: "s1",
        workspaceId: "w-vector",
        name: "ENC-1 · Fix the cart",
        ownerName: "Olga Owner",
        ownerEmail: "olga@groupon.com",
        role: "write",
        repositoryName: "engineering-development",
        keyHandedOver: true,
        chats: [
          { chatId: "ch-new", title: "Rounding", status: "working", model: "claude-opus-5-5" },
          {
            chatId: "ch-old",
            title: "claude · claude-haiku-4-5",
            status: "idle",
            model: "claude-haiku-4-5",
          },
        ],
      },
    ]);
  });

  it("reads an older hub without shares as nothing shared", () => {
    expect(sharedTree(overview())).toEqual([]);
    expect(sharesOfWorkspace(overview(), "w1")).toEqual([]);
  });

  it("finds the shared workspace a chat belongs to", () => {
    expect(sharedWorkspaceOfChat(overview({ sharedWithMe: [shared()] }), "ch-new")?.shareId).toBe(
      "s1",
    );
    expect(sharedWorkspaceOfChat(overview({ sharedWithMe: [shared()] }), "ch-mine")).toBeNull();
  });
});

describe("the share key", () => {
  it("opens the owner's box with the person's identity, as the seal key of the shared copies", () => {
    const key = sharedKeyOf(shared(), colleague);

    expect(key.ok && key.version).toBe(3);
    expect(key.ok && key.sealKey).toEqual(sealKeyFromShareKey(new Uint8Array(32).fill(9)));
  });

  it("says why there is no key: the vault is closed, the owner's Mac has not boxed it, or it is not this person's", () => {
    expect(sharedKeyOf(shared(), null)).toMatchObject({
      ok: false,
      why: expect.stringContaining("vault"),
    });
    expect(sharedKeyOf(shared({ sealedShareKey: null }), colleague)).toMatchObject({
      ok: false,
      why: expect.stringContaining("not handed over"),
    });
    expect(sharedKeyOf(shared(), identityFromVaultKey(new Uint8Array(32).fill(3)))).toMatchObject({
      ok: false,
      why: expect.stringContaining("does not open"),
    });
  });

  it("seals a prompt the owner's hand opens as a user message", () => {
    const key = sharedKeyOf(shared(), colleague);
    if (!key.ok) throw new Error(key.why);

    expect(
      openSealedJson(
        sealPrompt("check the rounding", "ch-new", key.sealKey),
        "ch-new",
        "message",
        key.sealKey,
      ),
    ).toEqual({
      v: 1,
      kind: "message",
      role: "user",
      text: "check the rounding",
    });
  });

  it("seals the device the prompt was written on, for the hand to name as its author's", () => {
    const key = sharedKeyOf(shared(), colleague);
    if (!key.ok) throw new Error(key.why);

    expect(
      openSealedJson(
        sealPrompt("check the rounding", "ch-new", key.sealKey, "Mac app"),
        "ch-new",
        "message",
        key.sealKey,
      ),
    ).toEqual({
      v: 1,
      kind: "message",
      role: "user",
      text: "check the rounding",
      device: "Mac app",
    });
  });
});

describe("the owner's side", () => {
  it("lists who one workspace is shared with", () => {
    const share = {
      id: "s1",
      workspaceId: "w1",
      grantee: {
        userId: "u2",
        name: "Carl",
        email: "carl@groupon.com",
        publicKey: bytesToBase64(colleague.publicKey),
      },
      role: "read" as const,
      sealedShareKey: null,
      shareKeyVersion: null,
      createdAt: "2026-10-19T19:30:00Z",
    };

    expect(
      sharesOfWorkspace(
        overview({ shares: [share, { ...share, id: "s2", workspaceId: "w2" }] }),
        "w1",
      ),
    ).toEqual([share]);
  });

  it("finds the hub workspace behind a sidebar workspace by its folder, never an archived one", () => {
    const workspace = {
      id: "w1",
      machine: "mac-a",
      repositoryId: "r1",
      branch: null,
      targetBranch: "staging",
      ticketKey: null,
      name: "Fix",
      path: "/Users/olga/ed-1",
      state: "ready" as const,
      status: "idle" as const,
      pinnedAt: null,
      prUrl: null,
      diffAdded: null,
      diffRemoved: null,
      archivedAt: null,
      updatedAt: "2026-10-19T19:30:00Z",
    };
    const hub = overview({
      workspaces: [
        workspace,
        { ...workspace, id: "w0", state: "archived", path: "/Users/olga/ed-2" },
      ],
    });

    expect(hubWorkspaceForPath(hub, "/Users/olga/ed-1/")?.id).toBe("w1");
    expect(hubWorkspaceForPath(hub, "/Users/olga/ed-2")).toBeNull();
  });
});

describe("the hub workspace behind a workspace made in the window", () => {
  const base: HubWorkspace = {
    id: "w-hub",
    machine: "mac-a",
    repositoryId: "r1",
    branch: "olga/cart",
    targetBranch: "staging",
    ticketKey: null,
    name: "Cart",
    path: "/Users/olga/ed-1",
    state: "ready",
    status: "idle",
    pinnedAt: null,
    prUrl: null,
    diffAdded: null,
    diffRemoved: null,
    archivedAt: null,
    updatedAt: "2026-10-21T08:00:00Z",
  };
  const mirrored = (overrides: Partial<HubWorkspace>): HubWorkspace => ({
    ...base,
    origin: "daemon",
    daemonServerId: "srv-a",
    daemonWorkspaceId: "pw-1",
    daemonState: "idle",
    lastActivityAt: "2026-10-21T08:00:00Z",
    ...overrides,
  });

  it("matches on the daemon's serverId and workspace id first, whatever the folder", () => {
    const hub = overview({
      workspaces: [
        { ...base, id: "w-folder", path: "/Users/olga/ed-1" },
        mirrored({ id: "w-mirror", path: "/Users/olga/elsewhere" }),
      ],
    });
    expect(hubWorkspaceForDaemon(hub, "srv-a", "pw-1", "/Users/olga/ed-1")?.id).toBe("w-mirror");
  });

  it("tells two Macs with the same folder apart by the daemon ids", () => {
    const hub = overview({
      workspaces: [
        mirrored({ id: "w-mac-a", machine: "mac-a" }),
        mirrored({ id: "w-mac-b", machine: "mac-b", daemonServerId: "srv-b" }),
      ],
    });
    expect(hubWorkspaceForDaemon(hub, "srv-b", "pw-1", "/Users/olga/ed-1")?.id).toBe("w-mac-b");
    expect(hubWorkspaceForDaemon(hub, "srv-a", "pw-1", "/Users/olga/ed-1")?.id).toBe("w-mac-a");
  });

  it("leaves an archived mirrored row out", () => {
    const hub = overview({ workspaces: [mirrored({ state: "archived" })] });
    expect(hubWorkspaceForDaemon(hub, "srv-a", "pw-1", "/Users/olga/ed-1")).toBeNull();
  });

  it("falls back to the folder, limited to that daemon's Mac", () => {
    const hub = overview({
      workspaces: [
        // A row of the same daemon names its Mac: mac-a.
        mirrored({ id: "w-other", daemonWorkspaceId: "pw-9", path: "/Users/olga/ed-9" }),
        { ...base, id: "w-on-b", machine: "mac-b" },
        { ...base, id: "w-on-a", machine: "mac-a" },
      ],
    });
    expect(hubWorkspaceForDaemon(hub, "srv-a", "pw-1", "/Users/olga/ed-1/")?.id).toBe("w-on-a");
  });

  it("takes the Mac from the window's own hub Macs when the daemon mirrored nothing yet", () => {
    const hub = overview({
      workspaces: [
        { ...base, id: "w-on-a", machine: "mac-a" },
        { ...base, id: "w-on-b", machine: "mac-b" },
      ],
    });
    expect(hubWorkspaceForDaemon(hub, "srv-b", "pw-1", "/Users/olga/ed-1", ["mac-b"])?.id).toBe(
      "w-on-b",
    );
  });

  it("never takes a folder row another workspace of the same daemon claims", () => {
    const hub = overview({
      workspaces: [mirrored({ id: "w-claimed", daemonWorkspaceId: "pw-2" })],
    });
    expect(hubWorkspaceForDaemon(hub, "srv-a", "pw-1", "/Users/olga/ed-1")).toBeNull();
  });

  it("finds a hub row by its folder alone from an older hub that sends no daemon fields", () => {
    const hub = overview({ workspaces: [base] });
    expect(hubWorkspaceForDaemon(hub, "srv-a", "pw-1", "/Users/olga/ed-1")?.id).toBe("w-hub");
  });

  it("answers null while the Mac has not mirrored a workspace made a moment ago", () => {
    const hub = overview({
      workspaces: [
        mirrored({ id: "w-other", daemonWorkspaceId: "pw-9", path: "/Users/olga/ed-9" }),
      ],
    });
    expect(hubWorkspaceForDaemon(hub, "srv-a", "pw-1", "/Users/olga/ed-1")).toBeNull();
    expect(hubWorkspaceForDaemon(hub, "srv-a", "pw-1")).toBeNull();
  });
});

describe("what a writer may still answer", () => {
  const opened = (body: OpenedMessage["body"], seq: number): OpenedMessage => ({
    row: {
      id: `m${seq}`,
      chatId: "ch",
      seq,
      role: "assistant",
      kind: body?.kind ?? "notice",
      envelope: "",
      costUsd: null,
      senderMachine: null,
      createdAt: "",
    },
    body,
  });

  it("offers the requests no answer followed", () => {
    const request = (requestId: string) =>
      opened(
        {
          v: 1,
          kind: "permission_request",
          requestId,
          toolName: "Write",
          input: {},
          suggestions: null,
          reason: null,
        },
        1,
      );
    const answer = opened(
      {
        v: 1,
        kind: "permission_answer",
        requestId: "r1",
        behavior: "allow",
        message: null,
        always: false,
      },
      2,
    );

    expect(openPermissionRequests([request("r1"), answer, request("r2")])).toEqual([
      { requestId: "r2", toolName: "Write" },
    ]);
  });
});

describe("an email typed into Share", () => {
  it.each([
    [" Carl@Groupon.com ", "carl@groupon.com"],
    ["carl", null],
    ["carl@groupon", null],
  ])("reads %s as %s", (typed, expected) => {
    expect(normaliseEmail(typed)).toBe(expected);
  });
});

// Added for Groupon Desk (fork of Paseo, Apache-2.0): who wrote a user message, how the chat draws it, and the author through the stream.
import { describe, expect, it } from "vitest";
import { applyStreamEvent, createUserMessage, reduceStreamUpdate } from "@/types/stream";
import type { HubOverview } from "./hub";
import {
  authorOfHubMessage,
  authorOfViewer,
  knownNames,
  messageLook,
  withAlpha,
} from "./message-author-model";

const olga = { userId: "u-olga", name: "Olga Owner", device: "Mac app" };
const carl = { userId: "u-carl", name: "Carl Colleague", device: "web" };

describe("messageLook", () => {
  it("draws the person's own message as theirs", () => {
    expect(
      messageLook({ author: olga, viewerUserId: "u-olga", viewerOwnsWorkspace: true }),
    ).toEqual({ kind: "mine" });
  });

  it("draws a colleague's message with their name and device on the chip", () => {
    expect(
      messageLook({ author: carl, viewerUserId: "u-olga", viewerOwnsWorkspace: true }),
    ).toEqual({
      kind: "colleague",
      chip: "Carl Colleague · web",
      accessibilityLabel: "Written by Carl Colleague · web",
    });
  });

  it("draws the owner's message as a colleague's to the colleague reading it", () => {
    expect(
      messageLook({ author: olga, viewerUserId: "u-carl", viewerOwnsWorkspace: false }),
    ).toMatchObject({ kind: "colleague", chip: "Olga Owner · Mac app" });
  });

  it("draws a message with no author as the owner's own, else as the owner's or someone's", () => {
    expect(
      messageLook({ author: undefined, viewerUserId: "u-olga", viewerOwnsWorkspace: true }),
    ).toEqual({
      kind: "mine",
    });
    expect(
      messageLook({
        author: null,
        viewerUserId: "u-carl",
        viewerOwnsWorkspace: false,
        ownerName: "Olga Owner",
      }),
    ).toMatchObject({ kind: "colleague", chip: "Olga Owner" });
    expect(
      messageLook({ author: null, viewerUserId: "u-carl", viewerOwnsWorkspace: false }),
    ).toMatchObject({ kind: "colleague", chip: "Someone" });
  });

  it("names a colleague whose name it lacks, and leaves out a blank device", () => {
    expect(
      messageLook({
        author: { userId: "u-x", name: " ", device: "" },
        viewerUserId: "u-olga",
        viewerOwnsWorkspace: true,
      }),
    ).toMatchObject({ kind: "colleague", chip: "A colleague" });
  });

  it("never takes an authored message for the viewer's while the viewer is unknown", () => {
    expect(
      messageLook({ author: olga, viewerUserId: null, viewerOwnsWorkspace: true }),
    ).toMatchObject({
      kind: "colleague",
    });
  });
});

describe("authorOfViewer", () => {
  it("is the signed-in person on this device, the email standing in for a missing name", () => {
    expect(
      authorOfViewer(
        { userId: "u-olga", name: "Olga Owner", email: "olga@groupon.com" },
        "Mac app",
      ),
    ).toEqual(olga);
    expect(
      authorOfViewer({ userId: "u-olga", name: null, email: "olga@groupon.com" }, "web"),
    ).toEqual({
      userId: "u-olga",
      name: "olga@groupon.com",
      device: "web",
    });
  });

  it("is nobody when no one is signed in", () => {
    expect(authorOfViewer(null, "web")).toBeNull();
    expect(authorOfViewer({ userId: null, name: "x", email: null }, "web")).toBeNull();
  });
});

describe("the hub transcript's authors", () => {
  const overview = {
    shares: [{ grantee: { userId: "u-carl", name: "Carl Colleague" } }],
    sharedWithMe: [{ owner: { userId: "u-olga", name: "Olga Owner" } }],
  } as unknown as HubOverview;

  it("knows the names of the people a workspace is shared with and of the owners who shared one", () => {
    expect([...knownNames(overview)]).toEqual([
      ["u-carl", "Carl Colleague"],
      ["u-olga", "Olga Owner"],
    ]);
    expect(knownNames(null).size).toBe(0);
  });

  it("takes the colleague the hub names, with the device sealed into the prompt", () => {
    expect(
      authorOfHubMessage({ senderUserId: "u-carl" }, "web", null, knownNames(overview)),
    ).toEqual(carl);
    expect(authorOfHubMessage({ senderUserId: "u-new" }, undefined, null, new Map())).toEqual({
      userId: "u-new",
      name: "",
    });
  });

  it("gives the owner's own prompt no author for the owner, and the owner to a colleague", () => {
    expect(authorOfHubMessage({ senderUserId: null }, undefined, null, new Map())).toBeNull();
    expect(
      authorOfHubMessage({}, undefined, { userId: "u-olga", name: "Olga Owner" }, new Map()),
    ).toEqual({ userId: "u-olga", name: "Olga Owner" });
  });
});

describe("withAlpha", () => {
  it("turns a #rrggbb colour into rgba() at the opacity and leaves any other colour alone", () => {
    expect(withAlpha("#20744A", 0.16)).toBe("rgba(32, 116, 74, 0.16)");
    expect(withAlpha("#ffffff", 2)).toBe("rgba(255, 255, 255, 1)");
    expect(withAlpha("#000000", -1)).toBe("rgba(0, 0, 0, 0)");
    expect(withAlpha("rgba(0,0,0,0.5)", 0.2)).toBe("rgba(0,0,0,0.5)");
  });
});

describe("the author on the chat's stream", () => {
  it("keeps the timeline's author on a user message", () => {
    const items = reduceStreamUpdate(
      [],
      {
        type: "timeline",
        provider: "claude",
        item: { type: "user_message", text: "check the rounding", messageId: "m-1", author: carl },
      },
      new Date(1),
    );
    expect(items[0]).toMatchObject({ kind: "user_message", author: carl });
  });

  it("keeps the author when the daemon's row reconciles the window's own optimistic message", () => {
    const optimistic = createUserMessage({
      clientMessageId: "c-1",
      text: "hello",
      timestamp: new Date(1),
      author: olga,
    });
    const reconciled = applyStreamEvent({
      tail: [optimistic],
      head: [],
      event: {
        type: "timeline",
        provider: "claude",
        item: { type: "user_message", text: "hello", clientMessageId: "c-1", messageId: "p-1" },
      },
      timestamp: new Date(2),
    });
    expect(reconciled.tail).toHaveLength(1);
    expect(reconciled.tail[0]).toMatchObject({ messageId: "p-1", author: olga });
  });

  it("takes the daemon's author over an optimistic message that had none", () => {
    const optimistic = createUserMessage({
      clientMessageId: "c-2",
      text: "hi",
      timestamp: new Date(1),
    });
    const reconciled = applyStreamEvent({
      tail: [optimistic],
      head: [],
      event: {
        type: "timeline",
        provider: "claude",
        item: { type: "user_message", text: "hi", clientMessageId: "c-2", author: carl },
      },
      timestamp: new Date(2),
    });
    expect(reconciled.tail[0]).toMatchObject({ author: carl });
  });
});

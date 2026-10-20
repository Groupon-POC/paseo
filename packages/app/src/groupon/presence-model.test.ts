// Added for Groupon Desk (fork of Paseo, Apache-2.0): the presence row's rules.
import { describe, expect, it } from "vitest";
import type { HubPresencePerson, HubWorkspacePresence } from "./hub";
import { deviceName, initials, presenceLines, presenceView } from "./presence-model";
import { hubShareRoute } from "./share-route";

const owner: HubPresencePerson = {
  userId: "u-owner",
  name: "Olga Owner",
  email: "olga@groupon.com",
  role: "owner",
  you: true,
  devices: ["Mac app"],
  seenAt: "2026-10-20T18:00:00.000Z",
};
const colleague: HubPresencePerson = {
  userId: "u-colleague",
  name: "Carl Colleague",
  email: "carl@groupon.com",
  role: "write",
  you: false,
  devices: ["iPhone", "web"],
  seenAt: "2026-10-20T18:00:00.000Z",
};
const hand = { machine: "mac-a", label: "Studio", connected: true, relayClients: 1 };

function presence(people: HubPresencePerson[], withHand = true): HubWorkspacePresence {
  return { workspaceId: "w1", people, hand: withHand ? hand : null, sharedWith: 1 };
}

describe("the presence row", () => {
  it("is hidden while the hub has not answered", () => {
    expect(presenceView(null, "owner")).toEqual({ kind: "hidden" });
    expect(presenceView(undefined, "colleague")).toEqual({ kind: "hidden" });
  });

  it("shows the owner no chips, only Share, when only they are in it", () => {
    expect(presenceView(presence([owner]), "owner")).toEqual({ kind: "share" });
  });

  it("shows a colleague nothing when only they are in it", () => {
    expect(presenceView(presence([{ ...colleague, you: true }]), "colleague")).toEqual({
      kind: "hidden",
    });
  });

  it("shows a chip per person, you marked, then the Mac, when two people are in it", () => {
    const view = presenceView(presence([owner, colleague]), "owner");
    expect(view.kind).toBe("people");
    if (view.kind !== "people") return;
    expect(view.chips.map((chip) => [chip.kind, chip.initials, chip.you])).toEqual([
      ["person", "OO", true],
      ["person", "CC", false],
      ["hand", "", false],
    ]);
    expect(view.chips[0].tooltip).toBe("Olga Owner · you · owner · Mac app");
    expect(view.chips[1].tooltip).toBe("Carl Colleague · may write · iPhone, web");
    expect(view.chips[2].tooltip).toBe("Studio, runs the agent, connected through Groupon");
    expect(view.label).toBe("2 people in this session now. Open Share.");
  });

  it("shows the colleague the owner and themselves, and no Mac chip when the hub knows no Mac", () => {
    const view = presenceView(
      presence(
        [
          { ...owner, you: false },
          { ...colleague, role: "read", you: true },
        ],
        false,
      ),
      "colleague",
    );
    if (view.kind !== "people") throw new Error(`expected people, got ${view.kind}`);
    expect(view.chips.map((chip) => chip.tooltip)).toEqual([
      "Olga Owner · owner · Mac app",
      "Carl Colleague · you · reads · iPhone, web",
    ]);
  });

  it("says when the Mac is not connected through Groupon", () => {
    const view = presenceView(
      { ...presence([owner, colleague]), hand: { ...hand, connected: false } },
      "owner",
    );
    if (view.kind !== "people") throw new Error(`expected people, got ${view.kind}`);
    expect(view.chips[2].tooltip).toBe(
      "Studio, runs the agent, not connected through Groupon right now",
    );
  });
});

describe("the share path", () => {
  it("opens Share for the hub workspace the row belongs to", () => {
    expect(hubShareRoute({ workspaceId: "w1" })).toBe("/hub-share?workspaceId=w1");
  });
});

describe("the Share screen's people", () => {
  it("lists each person with their facts, and nobody for no answer", () => {
    expect(presenceLines(presence([owner, colleague]))).toEqual([
      "Olga Owner · you · owner · Mac app",
      "Carl Colleague · may write · iPhone, web",
    ]);
    expect(presenceLines(null)).toEqual([]);
  });
});

describe("initials and devices", () => {
  it("takes the first and last word's letters, one word's first, or the email's", () => {
    expect(initials("Olga Maria Owner")).toBe("OO");
    expect(initials("carl")).toBe("C");
    expect(initials("  ", "sam@groupon.com")).toBe("S");
    expect(initials("", "")).toBe("?");
  });

  it("names the Mac app, the iPhone, Android and the web", () => {
    expect(deviceName("macos", true)).toBe("Mac app");
    expect(deviceName("ios", false)).toBe("iPhone");
    expect(deviceName("android", false)).toBe("Android");
    expect(deviceName("web", false)).toBe("web");
  });
});

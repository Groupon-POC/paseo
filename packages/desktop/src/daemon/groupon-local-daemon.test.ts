// Added for Groupon Desk (fork of Paseo, Apache-2.0): this Mac's own daemons, for a direct connection.
import { describe, expect, it } from "vitest";
import type { DaemonInstance } from "@getpaseo/server/daemon-control";
import {
  GROUPON_DESK_HAND_OWNS_DAEMON,
  grouponHandHome,
  localDaemonHomes,
  readLocalCredentialForRunningDaemon,
  readLocalDaemons,
} from "./groupon-local-daemon.js";

const instance = (listen: string | null, serverId?: string): DaemonInstance => ({
  pid: 1,
  startedAt: "2026-10-19T16:00:00.000Z",
  hostname: "mac",
  uid: 501,
  listen,
  ...(serverId ? { serverId } : {}),
});

describe("this Mac's daemons", () => {
  it("looks in the hand's home alone while the hand owns the daemon", () => {
    expect(GROUPON_DESK_HAND_OWNS_DAEMON).toBe(true);
    expect(grouponHandHome("/Users/p")).toBe("/Users/p/.groupon/paseo");
    // A daemon a Paseo window once started in ~/.paseo is never taken for this Mac's.
    expect(localDaemonHomes("/Users/p/.paseo", "/Users/p")).toEqual(["/Users/p/.groupon/paseo"]);
  });

  it("with the switch off, looks in the configured home and in the hand's home, each once", () => {
    expect(localDaemonHomes("/Users/p/.paseo", "/Users/p", false)).toEqual([
      "/Users/p/.paseo",
      "/Users/p/.groupon/paseo",
    ]);
    expect(localDaemonHomes("/Users/p/.groupon/paseo/", "/Users/p", false)).toEqual([
      "/Users/p/.groupon/paseo",
    ]);
  });

  it("lists the running ones that name a server id and a listen address", async () => {
    const byHome: Record<string, DaemonInstance | null> = {
      "/a": instance("127.0.0.1:6870", "srv_a"),
      "/b": null,
      "/c": instance(null, "srv_c"),
    };
    expect(
      await readLocalDaemons(["/a", "/b", "/c"], async (home) => byHome[home] ?? null),
    ).toEqual([{ home: "/a", serverId: "srv_a", listen: "127.0.0.1:6870" }]);
  });

  it("gives the credential of the running daemon listening on the target, and nothing else", async () => {
    const read = async (home: string) => (home === "/live" ? instance("127.0.0.1:6870") : null);
    const forTarget = (home: string, target: string) =>
      home === "/live" && target === "localhost:6870" ? "token" : null;
    expect(
      await readLocalCredentialForRunningDaemon(
        ["/gone", "/live"],
        "localhost:6870",
        read,
        forTarget,
      ),
    ).toBe("token");
    expect(
      await readLocalCredentialForRunningDaemon(
        ["/gone", "/live"],
        "localhost:7000",
        read,
        forTarget,
      ),
    ).toBeNull();
    expect(
      await readLocalCredentialForRunningDaemon(["/gone"], "localhost:6870", read, forTarget),
    ).toBeNull();
  });
});

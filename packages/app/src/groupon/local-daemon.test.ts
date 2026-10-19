// Added for Groupon Desk (fork of Paseo, Apache-2.0): this Mac's own daemons.
import { describe, expect, it } from "vitest";
import { localListenFor, readLocalDaemons } from "./local-daemon";

describe("this Mac's daemons", () => {
  it("reads the desktop app's answer, and nothing in a browser or an older desktop build", async () => {
    const invoke = async () => [
      { serverId: "srv_a", listen: "127.0.0.1:6870" },
      { serverId: 3, listen: "x" },
    ];
    expect(await readLocalDaemons(invoke)).toEqual([
      { serverId: "srv_a", listen: "127.0.0.1:6870" },
    ]);
    expect(await readLocalDaemons(undefined)).toEqual([]);
    expect(
      await readLocalDaemons(async () => {
        throw new Error("Unknown desktop command: groupon_local_daemons");
      }),
    ).toEqual([]);
  });

  it("finds the listen address of a server id", () => {
    const daemons = [{ serverId: "srv_a", listen: "127.0.0.1:6870" }];
    expect(localListenFor(daemons, "srv_a")).toBe("127.0.0.1:6870");
    expect(localListenFor(daemons, "srv_b")).toBeNull();
  });
});

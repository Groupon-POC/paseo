// Added for Groupon Desk (fork of Paseo, Apache-2.0): a window hosts browser tabs only for its own Mac's daemon.
/**
 * Tests for the browser host's placement: mounted for this Mac's daemon, never for another Mac's,
 * and never after the host was unmounted while this Mac's daemons were still being read.
 *
 * Covers: packages/app/src/groupon/browser-host-placement.ts
 */
import { describe, expect, it, vi } from "vitest";
import { mountBrowserHostOnThisMac } from "./browser-host-placement";

const THIS_MAC = [{ serverId: "srv_studio", listen: "127.0.0.1:6770" }];

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("mountBrowserHostOnThisMac", () => {
  it("hosts the browser for this Mac's daemon and stops on unmount", async () => {
    const stop = vi.fn();
    const mount = vi.fn(() => stop);
    const unmount = mountBrowserHostOnThisMac({
      serverId: "srv_studio",
      mount,
      readDaemons: async () => THIS_MAC,
    });
    await settle();
    expect(mount).toHaveBeenCalledTimes(1);
    unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("never hosts the browser for another Mac's daemon", async () => {
    const mount = vi.fn(() => () => {});
    mountBrowserHostOnThisMac({ serverId: "srv_air", mount, readDaemons: async () => THIS_MAC });
    await settle();
    expect(mount).not.toHaveBeenCalled();
  });

  it("never mounts once unmounted before this Mac's daemons were read", async () => {
    const mount = vi.fn(() => () => {});
    const unmount = mountBrowserHostOnThisMac({
      serverId: "srv_studio",
      mount,
      readDaemons: async () => THIS_MAC,
    });
    unmount();
    await settle();
    expect(mount).not.toHaveBeenCalled();
  });

  it("reports a failed read and hosts nothing", async () => {
    const mount = vi.fn(() => () => {});
    const onError = vi.fn();
    mountBrowserHostOnThisMac({
      serverId: "srv_studio",
      mount,
      readDaemons: async () => {
        throw new Error("no bridge");
      },
      onError,
    });
    await settle();
    expect(mount).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests that boot adds no host by address.
/**
 * Tests that the window's boot probes no address of its own while manual hosts are off.
 *
 * Covers:  runtime/host-runtime.ts (`bootstrapDefaultLocalhost`)
 */
import { describe, expect, it, vi } from "vitest";
import { HostRuntimeStore, type HostRuntimeControllerDeps } from "./host-runtime";

function storeWith(bootstrapDefaultLocalhost: boolean | undefined) {
  const connectToDaemon = vi.fn<HostRuntimeControllerDeps["connectToDaemon"]>(async () => {
    throw new Error("no daemon");
  });
  const store = new HostRuntimeStore({
    storage: {
      getItem: async () => null,
      setItem: async () => undefined,
      removeItem: async () => undefined,
    },
    deps: {
      createClient: () => {
        throw new Error("no client expected");
      },
      connectToDaemon,
      getClientId: async () => "cid_test",
      readInitialConnectionHint: () => null,
      ...(bootstrapDefaultLocalhost === undefined ? {} : { bootstrapDefaultLocalhost }),
    },
  });
  return { store, connectToDaemon };
}

describe("boot without manual hosts", () => {
  it("does not probe localhost:6767 (the window's policy allows no localhost connection)", async () => {
    const { store, connectToDaemon } = storeWith(false);
    await store.boot();
    expect(connectToDaemon).not.toHaveBeenCalled();
  });

  it("still probes it when the deps do not say otherwise (Paseo's own behavior)", async () => {
    const { store, connectToDaemon } = storeWith(undefined);
    await store.boot();
    expect(connectToDaemon).toHaveBeenCalledTimes(1);
    expect(connectToDaemon.mock.calls[0]?.[0].connection).toMatchObject({
      endpoint: "localhost:6767",
    });
  });
});

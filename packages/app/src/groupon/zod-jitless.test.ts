// Added for Groupon Desk (fork of Paseo, Apache-2.0): Zod parses without `new Function`.
/**
 * Tests that Zod, configured by `zod-jitless.ts`, parses object schemas without ever constructing
 * a Function (the string eval the web build's Content Security Policy blocks), and that without it
 * Zod does construct one (the test would see a regression).
 *
 * Covers: packages/app/src/groupon/zod-jitless.ts
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const RealFunction = globalThis.Function;

/** Every `new Function(...)` and `Function(...)` made while `run` goes, counted. */
async function functionsMadeDuring(run: () => Promise<void>): Promise<number> {
  let made = 0;
  globalThis.Function = new Proxy(RealFunction, {
    construct(target, args) {
      made += 1;
      return Reflect.construct(target, args);
    },
    apply(target, self, args) {
      made += 1;
      return Reflect.apply(target, self, args);
    },
  });
  try {
    await run();
  } finally {
    globalThis.Function = RealFunction;
  }
  return made;
}

async function parseObjects(): Promise<void> {
  const { z } = await import("zod");
  const schema = z.object({ id: z.string(), count: z.number(), tags: z.array(z.string()) });
  for (let i = 0; i < 5; i += 1) schema.parse({ id: "a", count: i, tags: ["x"] });
}

describe("zod-jitless", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("without it, Zod compiles its object parsers with new Function", async () => {
    vi.resetModules();

    expect(await functionsMadeDuring(parseObjects)).toBeGreaterThan(0);
  });

  it("with it, Zod parses objects without constructing a single Function", async () => {
    vi.resetModules();
    await import("./zod-jitless");

    expect(await functionsMadeDuring(parseObjects)).toBe(0);
  });
});

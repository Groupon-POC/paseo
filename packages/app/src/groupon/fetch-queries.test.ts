// Added for Groupon Desk (fork of Paseo, Apache-2.0): every Groupon fetch query declares a finite stale time.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `useFetchQuery` throws at render time on a missing or non-finite `staleTimeMs`, which takes the
 * whole screen down ("Fetch queries must declare a finite staleTimeMs", seen on Your phone and on
 * New workspace, 2026-10-20). Tests render few of these cards, so this reads the source instead.
 */
describe("Groupon fetch queries", () => {
  const folder = __dirname;
  const files = readdirSync(folder).filter(
    (name) => /\.tsx?$/.test(name) && !name.endsWith(".test.ts"),
  );

  it("declare a finite staleTimeMs on every useFetchQuery", () => {
    const problems: string[] = [];
    for (const name of files) {
      const text = readFileSync(join(folder, name), "utf8");
      let from = 0;
      for (;;) {
        const at = text.indexOf("useFetchQuery({", from);
        if (at < 0) break;
        let depth = 1;
        let end = at + "useFetchQuery({".length;
        while (depth > 0 && end < text.length) {
          if (text[end] === "{") depth += 1;
          else if (text[end] === "}") depth -= 1;
          end += 1;
        }
        const block = text.slice(at, end);
        const line = text.slice(0, at).split("\n").length;
        const stale = /staleTimeMs:\s*([^,\n]+)/.exec(block)?.[1]?.trim();
        if (!stale) problems.push(`${name}:${line} has no staleTimeMs`);
        else if (/Infinity|NaN/.test(stale))
          problems.push(`${name}:${line} uses a non-finite staleTimeMs (${stale})`);
        from = end;
      }
    }
    expect(problems).toEqual([]);
  });
});

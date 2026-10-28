// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for reading Claude Code's limit message.

import { describe, expect, it } from "vitest";
import { fullestUsagePercent, isShownUsageReport, usageHealthColor } from "./usage-health";
import { parseUsageLimitMessage, timeUntilReset } from "./usage-limit-model";

describe("Claude Code's limit message", () => {
  // 16:40 in Prague (UTC+1 on 2026-10-28).
  const sentAt = new Date("2026-10-28T15:40:00Z");

  it("names the limit and finds the next reset in the message's own time zone", () => {
    const notice = parseUsageLimitMessage(
      "You've hit your 5-hour limit · resets 7pm (Europe/Prague)",
      sentAt,
    );

    expect(notice?.limit).toBe("5-hour");
    expect(notice?.resetsText).toBe("7pm (Europe/Prague)");
    expect(notice?.resetsAt?.toISOString()).toBe("2026-10-28T18:00:00.000Z");
    expect(timeUntilReset(notice!.resetsAt!, sentAt.getTime())).toBe("2h 20m");
    expect(timeUntilReset(notice!.resetsAt!, Date.parse("2026-10-28T18:05:00Z"))).toBeNull();
  });

  it("reads the older form with its epoch and leaves other text alone", () => {
    expect(
      parseUsageLimitMessage(
        "Claude AI usage limit reached|1793210400",
        sentAt,
      )?.resetsAt?.getTime(),
    ).toBe(1793210400 * 1000);
    expect(parseUsageLimitMessage("The limit on the cart is five", sentAt)).toBeNull();
    expect(
      parseUsageLimitMessage("You've hit your weekly limit · resets Nov 1, 12pm", sentAt)?.resetsAt,
    ).toBeNull();
  });
});

describe("usage sources and the sidebar icon", () => {
  const report = (sourceId: string, status: string, usedPcts: number[] = []) =>
    ({
      sourceId,
      report:
        status === "available"
          ? { status, windows: usedPcts.map((usedPct, index) => ({ id: `w${index}`, usedPct })) }
          : { status },
    }) as never;

  it("hides a source that never reported, unless it is a Claude subscription", () => {
    expect(isShownUsageReport(report("cursor", "unavailable"))).toBe(false);
    expect(isShownUsageReport(report("groupon-subscriptions", "unavailable"))).toBe(true);
    expect(isShownUsageReport(report("cursor", "available", [10]))).toBe(true);
    expect(
      isShownUsageReport({ ...(report("codex", "error") as object), lastSuccessful: {} } as never),
    ).toBe(true);
  });

  it("colours the icon by the fullest limit", () => {
    const reports = [report("a", "available", [43, 100]), report("b", "unavailable")];

    expect(fullestUsagePercent(reports)).toBe(100);
    expect(usageHealthColor(100)).toBe("statusDotDanger");
    expect(usageHealthColor(70)).toBe("statusDotWarning");
    expect(usageHealthColor(20)).toBe("statusDotSuccess");
    expect(usageHealthColor(null)).toBeNull();
  });
});

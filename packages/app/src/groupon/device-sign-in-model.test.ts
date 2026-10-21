// Added for Groupon Desk (fork of Paseo, Apache-2.0): the gate's device sign-in, without the screen.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceAuthPoll, DeviceAuthStart } from "./core-client";
import {
  coreLineShown,
  runDeviceSignIn,
  signInPageAddress,
  signInPageLink,
  typeCodeLine,
  type DeviceSignInDeps,
} from "./device-sign-in-model";
import { environmentChoiceOffered } from "./environments";

const openExternalUrl = vi.hoisted(() => vi.fn());
vi.mock("@/utils/open-external-url", () => ({ openExternalUrl }));

const DEVICE_URL = "https://sso.livingsocial.com/device?code=AEFZ-XHQC";

const FLOW: DeviceAuthStart = {
  deviceCode: "device-code",
  userCode: "AEFZ-XHQC",
  verificationUri: DEVICE_URL,
  expiresIn: 60,
  pollIntervalSeconds: 5,
};

function deps(answers: DeviceAuthPoll["status"][], overrides: Partial<DeviceSignInDeps> = {}) {
  let clock = 0;
  const queue = [...answers];
  return {
    start: vi.fn(async () => FLOW),
    poll: vi.fn(async (): Promise<DeviceAuthPoll> => {
      const status = queue.shift() ?? "pending";
      return status === "approved"
        ? { status, accessToken: "a", refreshToken: "r", accessTokenExpiresAt: "2026-10-22" }
        : { status };
    }),
    sleep: vi.fn(async (ms: number) => {
      clock += ms;
    }),
    now: () => clock,
    isCancelled: () => false,
    onStarted: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => openExternalUrl.mockClear());

describe("runDeviceSignIn", () => {
  it("hands the code to the screen and never opens the sign-in page itself", async () => {
    const d = deps(["pending", "approved"]);
    const approved = await runDeviceSignIn("https://api-core.livingsocial.com", "test", d);
    expect(approved?.status).toBe("approved");
    expect(d.onStarted).toHaveBeenCalledWith(FLOW);
    expect(openExternalUrl).not.toHaveBeenCalled();
    expect(d.poll).toHaveBeenCalledTimes(2);
  });

  it("polls no faster than every two seconds", async () => {
    const d = deps(["approved"], {
      start: async () => ({ ...FLOW, pollIntervalSeconds: 0 }),
    });
    await runDeviceSignIn("https://core", "test", d);
    expect(d.sleep).toHaveBeenCalledWith(2000);
  });

  it("throws on a denial and on an expired code", async () => {
    await expect(runDeviceSignIn("https://core", "test", deps(["denied"]))).rejects.toThrow(
      "The sign-in was denied.",
    );
    await expect(runDeviceSignIn("https://core", "test", deps(["expired"]))).rejects.toThrow(
      "The code expired",
    );
    await expect(runDeviceSignIn("https://core", "test", deps([]))).rejects.toThrow(
      "The code expired",
    );
  });

  it("stops quietly once the screen is gone", async () => {
    const d = deps(["pending"], { isCancelled: () => true });
    await expect(runDeviceSignIn("https://core", "test", d)).resolves.toBeNull();
    expect(d.onStarted).not.toHaveBeenCalled();
  });
});

describe("the sign-in page link", () => {
  it("is a link the person's tap opens in a new tab", () => {
    expect(signInPageLink(DEVICE_URL)).toEqual({
      href: DEVICE_URL,
      target: "_blank",
      rel: "noopener noreferrer",
    });
  });

  it("refuses anything that is not an http(s) address", () => {
    expect(signInPageLink("javascript:alert(1)")).toBeNull();
    expect(signInPageLink("not a url")).toBeNull();
  });

  it("names the page by host and path only, without the code in the query", () => {
    expect(signInPageAddress(DEVICE_URL)).toBe("sso.livingsocial.com/device");
    expect(typeCodeLine(DEVICE_URL)).toBe("or type the code at sso.livingsocial.com/device");
    expect(typeCodeLine(DEVICE_URL)).not.toContain("?");
    expect(signInPageAddress("https://sso.livingsocial.com/")).toBe("sso.livingsocial.com");
    expect(typeCodeLine("nope")).toBeNull();
  });
});

describe("the Core line", () => {
  it("is hidden in a release build, which signs in to production alone", () => {
    expect(coreLineShown(environmentChoiceOffered(false, undefined))).toBe(false);
  });

  it("stays in a build that offers a choice of Core", () => {
    expect(coreLineShown(environmentChoiceOffered(true, undefined))).toBe(true);
    expect(coreLineShown(environmentChoiceOffered(false, "all"))).toBe(true);
  });
});

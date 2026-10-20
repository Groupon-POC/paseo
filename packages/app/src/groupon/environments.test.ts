// Added for Groupon Desk (fork of Paseo, Apache-2.0): the Core addresses a person may sign in to.
import { describe, expect, it } from "vitest";
import {
  defaultEnvironmentId,
  environmentById,
  environmentChoiceOffered,
  GROUPON_DESK_WEB_URL,
  normaliseCoreUrl,
} from "./environments";
import { identityOf } from "./core-client";

describe("Core addresses", () => {
  it("names the estate table's hosted Cores and Core's local port", () => {
    expect(environmentById("production").coreUrl).toBe("https://api-core.livingsocial.com");
    expect(environmentById("staging").coreUrl).toBe("https://api-staging-core.livingsocial.com");
    expect(environmentById("local").coreUrl).toBe("http://localhost:4000");
  });

  it("names the work window's web address per environment", () => {
    expect(GROUPON_DESK_WEB_URL).toEqual({
      production: "https://desk.livingsocial.com",
      staging: "https://desk.grpn.site",
      local: "http://localhost:8082",
    });
  });

  it("starts a release build on production and only a development bundle on the local Core", () => {
    expect(defaultEnvironmentId(false)).toBe("production");
    expect(defaultEnvironmentId(true)).toBe("local");
  });

  it("takes https anywhere and plain http only on this machine", () => {
    expect(normaliseCoreUrl(" http://localhost:4100/ ")).toBe("http://localhost:4100");
    expect(normaliseCoreUrl("http://127.0.0.1:4200/path")).toBe("http://127.0.0.1:4200");
    expect(normaliseCoreUrl("https://api-core.livingsocial.com")).toBe(
      "https://api-core.livingsocial.com",
    );
    expect(normaliseCoreUrl("http://api-core.livingsocial.com")).toBeNull();
    expect(normaliseCoreUrl("ftp://localhost")).toBeNull();
    expect(normaliseCoreUrl("not a url")).toBeNull();
  });
});

describe("identityOf", () => {
  it("reads the user id and email from a token's payload, and nothing from garbage", () => {
    const payload = btoa(JSON.stringify({ userId: "u-1", email: "a@b.c", name: "A" })).replace(
      /=+$/,
      "",
    );
    expect(identityOf(`x.${payload}.y`)).toEqual({ userId: "u-1", email: "a@b.c", name: "A" });
    expect(identityOf("garbage")).toEqual({ userId: null, email: null, name: null });
  });
});

describe("environmentChoiceOffered", () => {
  it("offers the three Cores in a development bundle, production alone in a release build, and all three when a release build asks for them", () => {
    expect(environmentChoiceOffered(true, undefined)).toBe(true);
    expect(environmentChoiceOffered(false, undefined)).toBe(false);
    expect(environmentChoiceOffered(false, "all")).toBe(true);
    expect(environmentChoiceOffered(false, "production")).toBe(false);
  });
});

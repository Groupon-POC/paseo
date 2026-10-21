// Added for Groupon Desk (fork of Paseo, Apache-2.0): the Your phone page's home screen guide and the web app's install files.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GROUPON_PHONE } from "./strings";

const publicDir = resolve(__dirname, "../../public");
const read = (name: string) => readFileSync(resolve(publicDir, name), "utf8");

describe("the Your phone home screen guide", () => {
  it("lists the iPhone steps in order: Safari, Share, Add to Home Screen, the icon", () => {
    const steps = GROUPON_PHONE.guideIosSteps;
    expect(steps).toHaveLength(4);
    expect(steps[0]).toContain("Safari");
    expect(steps[1]).toContain("Share");
    expect(steps[2]).toContain("Add to Home Screen");
    expect(steps[3]).toContain("icon");
  });

  it("gives Android one line: Chrome, the menu, Install app", () => {
    expect(GROUPON_PHONE.guideAndroid).toContain("Chrome");
    expect(GROUPON_PHONE.guideAndroid).toContain("menu");
    expect(GROUPON_PHONE.guideAndroid).toContain("Install app");
  });

  it("uses no em-dashes", () => {
    const text = [
      GROUPON_PHONE.guideTitle,
      ...GROUPON_PHONE.guideIosSteps,
      GROUPON_PHONE.guideAndroid,
    ];
    for (const line of text) expect(line).not.toContain("—");
  });

  it("is drawn under the QR code by the page", () => {
    const page = readFileSync(resolve(__dirname, "phone-section.tsx"), "utf8");
    expect(page.indexOf("<AddressQr")).toBeGreaterThan(-1);
    expect(page.indexOf("<HomeScreenGuide />")).toBeGreaterThan(page.indexOf("<AddressQr"));
  });
});

describe("the web app's install files", () => {
  const manifest = JSON.parse(read("manifest.json")) as {
    name: string;
    start_url: string;
    display: string;
    theme_color: string;
    icons: { src: string; sizes: string }[];
  };

  it("parses and carries name, start_url, display standalone and a theme colour", () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("names a 192 and a 512 icon that exist in public/", () => {
    for (const size of ["192x192", "512x512"]) {
      const icon = manifest.icons.find((candidate) => candidate.sizes === size);
      expect(icon, size).toBeDefined();
      expect(() => readFileSync(resolve(publicDir, `.${icon?.src}`))).not.toThrow();
    }
  });

  it("links the manifest and the apple-touch-icon and sets the iOS app meta in the page", () => {
    const html = read("index.html");
    expect(html).toContain('rel="manifest" href="/manifest.json"');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(html).toContain('name="apple-mobile-web-app-title"');
    expect(readFileSync(resolve(publicDir, "apple-touch-icon.png")).length).toBeGreaterThan(0);
  });
});

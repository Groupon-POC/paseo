// Changed for Groupon Desk (fork of Paseo, Apache-2.0): the registry's page addresses read as registry references, a Git URL stays Git.
import { describe, expect, it } from "vitest";
import {
  PluginRegistryIndexSchema,
  PublishedPluginDetailSchema,
  parsePluginRegistryReference,
  pluginMediaKind,
} from "./plugin-registry.js";

describe("plugin media kind", () => {
  it.each([
    ["https://cdn.example.com/a/preview.png", "image"],
    ["https://cdn.example.com/a/preview.JPG", "image"],
    ["https://cdn.example.com/a/preview.jpeg", "image"],
    ["https://cdn.example.com/a/preview.webp", "image"],
    ["https://cdn.example.com/a/preview.gif", "image"],
    ["https://cdn.example.com/a/demo.mp4", "video"],
    ["https://cdn.example.com/a/demo.WebM", "video"],
    ["https://cdn.example.com/a/demo.mp4?raw=true#t=2", "video"],
    ["https://cdn.example.com/mp4/preview.png?format=mp4", "image"],
  ] as const)("reads %s as %s from its path extension", (url, kind) => {
    expect(pluginMediaKind(url)).toBe(kind);
  });
});

describe("plugin registry references", () => {
  it.each([
    "https://paseo.sh/plugins/linhmh8/agent-lobby",
    "https://paseo.sh/plugins/linhmh8/agent-lobby/",
    "https://plugins.paseo.sh/linhmh8/agent-lobby",
    "https://plugins.paseo.sh/linhmh8/agent-lobby/",
  ])("reads the registry page %s as linhmh8/agent-lobby on Paseo's registry", (source) => {
    expect(parsePluginRegistryReference(source)).toEqual({
      url: "https://plugins.paseo.sh",
      id: "linhmh8/agent-lobby",
    });
  });

  it("names Paseo's registry for a page address even when the daemon's default is another", () => {
    expect(
      parsePluginRegistryReference(
        "https://paseo.sh/plugins/linhmh8/agent-lobby",
        "https://registry.example.com",
      ),
    ).toEqual({ url: "https://plugins.paseo.sh", id: "linhmh8/agent-lobby" });
  });

  it.each([
    "https://github.com/x/y.git",
    "https://github.com/x/y",
    "https://paseo.sh/plugins/linhmh8",
    "https://paseo.sh/plugins/linhmh8/agent-lobby/extra",
    "https://paseo.sh/docs/linhmh8/agent-lobby",
    "http://paseo.sh/plugins/linhmh8/agent-lobby",
    "https://paseo.sh/plugins/linhmh8/agent-lobby?tab=readme",
  ])("leaves %s to the Git and other readers", (source) => {
    expect(parsePluginRegistryReference(source)).toBeNull();
  });

  it("keeps owner/slug on the default registry and host/owner/slug on its host", () => {
    expect(parsePluginRegistryReference("patruxs/pigmonitor")).toEqual({
      url: "https://plugins.paseo.sh",
      id: "patruxs/pigmonitor",
    });
    expect(parsePluginRegistryReference("registry.example.com/patruxs/pigmonitor")).toEqual({
      url: "https://registry.example.com",
      id: "patruxs/pigmonitor",
    });
  });
});

const LEGACY_PLUGIN = {
  id: "acme/theme",
  name: "Acme theme",
  description: "A dark theme.",
  categories: ["themes"],
  author: { github: "acme" },
  repository: { url: "https://github.com/acme/theme" },
  artifact: { kind: "git", remote: "https://github.com/acme/theme", commit: "a".repeat(40) },
  media: [],
  submittedAt: "2026-01-01T00:00:00.000Z",
  reviewedAt: "2026-01-02T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  publishedAt: "2026-01-02T00:00:00.000Z",
};
const LEGACY_INDEX = {
  schemaVersion: 1,
  registry: { name: "Paseo", url: "https://plugins.paseo.sh" },
  categories: [{ slug: "themes", label: "Themes" }],
  plugins: [LEGACY_PLUGIN],
  featured: [],
  generatedAt: "2026-01-02T00:00:00.000Z",
};

describe("plugin listing translations", () => {
  it("parses an index published before translations existed", () => {
    const index = PluginRegistryIndexSchema.parse(LEGACY_INDEX);
    expect(index.plugins[0].translations).toBeUndefined();
  });

  it("keeps per-language name and description, each optional", () => {
    const translations = { "zh-CN": { description: "深色主题。" } };
    const index = PluginRegistryIndexSchema.parse({
      ...LEGACY_INDEX,
      plugins: [{ ...LEGACY_PLUGIN, translations }],
    });
    expect(index.plugins[0].translations).toEqual(translations);
  });

  it("keeps translated overviews on the detail document beside the English readme", () => {
    const detail = PublishedPluginDetailSchema.parse({
      ...LEGACY_PLUGIN,
      readme: "# Acme theme",
      overviewTranslations: { "zh-CN": "# Acme 主题" },
    });
    expect(detail.readme).toBe("# Acme theme");
    expect(detail.overviewTranslations).toEqual({ "zh-CN": "# Acme 主题" });
    expect(PublishedPluginDetailSchema.parse({ ...LEGACY_PLUGIN, readme: "" })).not.toHaveProperty(
      "overviewTranslations",
    );
  });

  it("still requires the English name and description", () => {
    const { name: _name, ...nameless } = LEGACY_PLUGIN;
    const result = PluginRegistryIndexSchema.safeParse({
      ...LEGACY_INDEX,
      plugins: [{ ...nameless, translations: { "zh-CN": { name: "Acme 主题" } } }],
    });
    expect(result.success).toBe(false);
  });
});

// Changed for Groupon Desk (fork of Paseo, Apache-2.0): the registry's page addresses (https://paseo.sh/plugins/<owner>/<slug>, https://plugins.paseo.sh/<owner>/<slug>) read as registry references.
import { z } from "zod";

export const PluginRegistryIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const PluginRegistryIdentitySchema = z.object({
  url: z.string().url(),
  id: PluginRegistryIdSchema,
});
export const PluginRegistriesSchema = z.record(
  z.string(),
  z.object({ authorization: z.string().min(1) }),
);
export const PluginRegistryArtifactSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("npm"),
    package: z.string().regex(/^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/),
    version: z.string().regex(/^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/),
    resolved: z.string().url(),
    integrity: z.string().regex(/^sha512-[A-Za-z0-9+/]+=*$/),
  }),
  z.object({
    kind: z.literal("git"),
    remote: z.string().min(1),
    commit: z.string().regex(/^[0-9a-f]{40,64}$/),
    pluginPath: z
      .string()
      .regex(/^[^\\:]+$/)
      .optional(),
  }),
]);
/**
 * Listing text in other languages, keyed by language tag such as `zh-CN`. A missing field falls back
 * to the English `name` or `description`, which stay required so older clients keep working.
 */
export const PluginListingTranslationsSchema = z.record(
  z.string(),
  z.object({ name: z.string().optional(), description: z.string().optional() }),
);
export const PublishedPluginSchema = z.object({
  id: PluginRegistryIdSchema,
  name: z.string(),
  description: z.string(),
  translations: PluginListingTranslationsSchema.optional(),
  license: z.string().optional(),
  categories: z.array(z.string()),
  author: z.object({ github: z.string(), name: z.string().optional(), npm: z.string().optional() }),
  repository: z.object({ url: z.string().url(), commit: z.string().optional() }),
  artifact: PluginRegistryArtifactSchema,
  icon: z.string().url().optional(),
  /** Images and videos in display order; see `pluginMediaKind`. */
  media: z.array(z.string().url()),
  submittedAt: z.string(),
  reviewedAt: z.string(),
  updatedAt: z.string(),
  publishedAt: z.string(),
  installs: z.number().int().nonnegative().optional(),
});
const VIDEO_EXTENSIONS = new Set(["mp4", "webm"]);

/** Whether a registry media entry is a video or an image, from its path extension. */
export function pluginMediaKind(url: string): "image" | "video" {
  const extension = new URL(url).pathname.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXTENSIONS.has(extension) ? "video" : "image";
}
export const PublishedPluginDetailSchema = PublishedPluginSchema.extend({
  readme: z.string(),
  /** The overview in other languages, keyed like `translations`. Each one replaces `readme` whole. */
  overviewTranslations: z.record(z.string(), z.string()).optional(),
});
export const PluginRegistryIndexSchema = z.object({
  schemaVersion: z.literal(1),
  registry: z.object({ name: z.string(), url: z.string().url() }),
  categories: z.array(
    z.object({ slug: z.string(), label: z.string(), description: z.string().optional() }),
  ),
  plugins: z.array(PublishedPluginSchema),
  /** Plugin IDs the maintainer features, in display order. An ID may name a plugin that is not listed. */
  featured: z.array(z.string()),
  generatedAt: z.string(),
});
export type PluginRegistryIdentity = z.infer<typeof PluginRegistryIdentitySchema>;
export type PluginRegistries = z.infer<typeof PluginRegistriesSchema>;

/** Paseo's public registry: the one its page addresses on paseo.sh name. */
const PASEO_REGISTRY_URL = "https://plugins.paseo.sh";

/**
 * The registry id a plugin's page address names: `https://paseo.sh/plugins/<owner>/<slug>` (the
 * page a person copies from the browser) or `https://plugins.paseo.sh/<owner>/<slug>`, with or
 * without a trailing slash; null for any other address, so a Git URL stays a Git URL.
 */
function registryPageId(source: string): string | null {
  const match = /^https:\/\/(?:paseo\.sh\/plugins|plugins\.paseo\.sh)\/([^/?#]+\/[^/?#]+)\/?$/.exec(
    source,
  );
  const id = match?.[1];
  return id && PluginRegistryIdSchema.safeParse(id).success ? id : null;
}

export function parsePluginRegistryReference(
  source: string,
  defaultUrl = PASEO_REGISTRY_URL,
): PluginRegistryIdentity | null {
  const pageId = registryPageId(source);
  if (pageId) return { url: PASEO_REGISTRY_URL, id: pageId };
  const segments = source.split("/");
  if (segments.length === 2 && PluginRegistryIdSchema.safeParse(source).success)
    return { url: defaultUrl.replace(/\/+$/, ""), id: source };
  const [host, ...rest] = segments;
  if (segments.length !== 3 || !host || !/[.:]/.test(host) || /[@?#\\]/.test(host)) return null;
  const id = rest.join("/");
  if (!PluginRegistryIdSchema.safeParse(id).success) return null;
  const url = new URL(`https://${host}`);
  return { url: url.origin, id };
}

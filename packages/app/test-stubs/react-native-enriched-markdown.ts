// Added for Groupon Desk (fork of Paseo, Apache-2.0): the browser test project's stand-in for react-native-enriched-markdown.
/**
 * Since 0.13 the plugin UI (`src/plugins/react-native/ui.ts`) exports Markdown, so any browser test
 * that mounts the sidebar reaches this package; Vite's dependency optimizer cannot bundle its web
 * parser (`lib/module/web/wasm/md4c.js` mixes `import.meta` with `module.exports`, so esbuild finds
 * no default export) and every browser test then fails. No browser test reads rendered Markdown;
 * the unit project keeps the real package.
 */
import type { ComponentType } from "react";

export const EnrichedMarkdownText: ComponentType<Record<string, unknown>> = () => null;

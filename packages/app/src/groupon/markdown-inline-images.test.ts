// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for the markdown library's inline images, as patched in patches/react-native-enriched-markdown+*.patch.
import { describe, expect, it } from "vitest";
import type { ASTNode } from "react-native-enriched-markdown/src/web/types";
import { markInlineImages } from "react-native-enriched-markdown/src/web/utils";

const image = (url: string): ASTNode => ({ type: "Image", attributes: { url } });
const text = (content: string): ASTNode => ({ type: "Text", content });
const inlineOf = (node: ASTNode): boolean => node.attributes?.isInline === true;

describe("markInlineImages", () => {
  it("keeps an icon inside bold text inline, as CodeRabbit's pre-merge counters", () => {
    const icon = image("passed.svg");
    const paragraph: ASTNode = {
      type: "Paragraph",
      children: [{ type: "Strong", children: [text("Pre-merge checks: "), icon, text(" 4")] }],
    };
    markInlineImages(paragraph);
    expect(inlineOf(icon)).toBe(true);
  });

  it("keeps linked badges beside text inline, and a lone linked picture a block", () => {
    const badge = image("ci.svg");
    const row: ASTNode = {
      type: "Paragraph",
      children: [{ type: "Link", children: [badge] }, text(" build")],
    };
    const picture = image("screenshot.png");
    const lone: ASTNode = { type: "Paragraph", children: [{ type: "Link", children: [picture] }] };
    markInlineImages({ type: "Document", children: [row, lone] });
    expect(inlineOf(badge)).toBe(true);
    expect(inlineOf(picture)).toBe(false);
  });
});

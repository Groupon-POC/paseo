// Changed for Groupon Desk (fork of Paseo, Apache-2.0): two replies next to each other sit a short gap apart (16 px, was 40).
import type { StreamItem } from "@/types/stream";
import { SPACING } from "@/styles/theme";

export function getAssistantMessageSpacing(params: {
  item: StreamItem;
  hasFooterBelow?: boolean;
  belowItem?: StreamItem | null;
}): "default" | "compactBottom" {
  if (params.item.kind !== "assistant_message") return "default";
  // Groupon Desk: a reply right above another one (tool calls hidden by Output only or Live)
  // gives up its bottom padding, so two replies sit a short gap apart, not two paddings and a gap.
  return params.hasFooterBelow || params.belowItem?.kind === "assistant_message"
    ? "compactBottom"
    : "default";
}

const isUserMessageItem = (item?: StreamItem | null) => item?.kind === "user_message";
const isToolSequenceItem = (item?: StreamItem | null) =>
  item?.kind === "tool_call" || item?.kind === "thought" || item?.kind === "todo_list";

export function getGapBetweenStreamItems(
  item: StreamItem | null,
  belowItem: StreamItem | null,
): number {
  if (!item || !belowItem) {
    return 0;
  }

  if (isUserMessageItem(item) && isUserMessageItem(belowItem)) {
    return SPACING[1];
  }
  if (item.kind === "user_message" && belowItem.kind === "assistant_message") {
    return 0;
  }
  if (isToolSequenceItem(item) && isToolSequenceItem(belowItem)) {
    return 0;
  }
  if (item.kind === "user_message" && isToolSequenceItem(belowItem)) {
    return SPACING[4];
  }
  if (item.kind === "assistant_message" && isToolSequenceItem(belowItem)) {
    return SPACING[1];
  }
  if (isToolSequenceItem(item) && belowItem.kind === "assistant_message") {
    return SPACING[1];
  }
  if (item.kind === "assistant_message" && belowItem.kind === "assistant_message") {
    return SPACING[1];
  }
  return SPACING[4];
}

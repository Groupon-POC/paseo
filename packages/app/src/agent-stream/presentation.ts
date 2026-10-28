// Changed for Groupon Desk (fork of Paseo, Apache-2.0): the chat's display mode filters the presented rows, and Live hides failed calls when the person turned them off.
import type { TimelineItemTransform } from "@/plugins/timeline/model";
import { projectPluginTimelineItems } from "@/plugins/timeline/projection";
import {
  prepareToolCallHistory,
  projectToolCallDetailLevel,
  type PreparedToolCallHistory,
  type ToolCallDetailLevel,
} from "@/tool-calls/detail-level/projection";
import type { StreamItem, UserMessageItem } from "@/types/stream";
import type { ChatDisplayMode } from "@/hooks/use-settings";
import { filterForDisplayMode } from "./display-mode";

interface PresentationInput {
  tail: StreamItem[];
  head: StreamItem[];
  transform: TimelineItemTransform | undefined;
  level: ToolCallDetailLevel;
  isTurnActive: boolean;
  displayMode?: ChatDisplayMode;
  /** Live keeps the failed tool calls; on unless the person turned them off. */
  showFailed?: boolean;
}

/** Find and scrolling address a plugin row by the source it replaces. */
export function getStreamItemMessageId(item: StreamItem): string {
  if (item.kind === "plugin") return item.sourceId ?? item.id;
  return item.id;
}

/** Source messages reach plugins before display projection. */
export function createStreamPresentation() {
  const userMessageCache = new WeakMap<UserMessageItem, UserMessageItem>();

  function presentUserMessage(item: UserMessageItem): UserMessageItem {
    const cached = userMessageCache.get(item);
    if (cached) return cached;

    // Recognize the complete voice envelope, including older messages without the
    // instruction suffix. Leave quoted examples and unrelated XML untouched.
    const spokenInput =
      /^\s*<spoken-input>([\s\S]*?)<\/spoken-input>(?:\s*<instruction>This message was spoken by the user\.[\s\S]*?<\/instruction>)?\s*$/.exec(
        item.text,
      );
    const projected = spokenInput ? { ...item, text: spokenInput[1].trim() } : item;
    userMessageCache.set(item, projected);
    return projected;
  }

  let historySource: StreamItem[] | undefined;
  let historyTransform: TimelineItemTransform | undefined;
  let historyRows: StreamItem[] = [];
  let preparedTail: StreamItem[] | undefined;
  let preparedLevel: ToolCallDetailLevel | undefined;
  let preparedHistory: PreparedToolCallHistory | null = null;
  let filteredSource: StreamItem[] | undefined;
  let filteredMode: ChatDisplayMode | undefined;
  let filteredShowFailed: boolean | undefined;
  let filteredTurnActive: boolean | undefined;
  let filteredTail: StreamItem[] = [];

  function presentRows(item: StreamItem): StreamItem[] {
    return [item.kind === "user_message" ? presentUserMessage(item) : item];
  }

  return (input: PresentationInput) => {
    // Retained history is not reprojected or regrouped on each live text update.
    if (historySource !== input.tail || historyTransform !== input.transform) {
      historyRows = projectPluginTimelineItems(input.tail, input.transform).flatMap<StreamItem>(
        (item) => presentRows(item),
      );
      historySource = input.tail;
      historyTransform = input.transform;
    }
    const head: StreamItem[] = [];
    for (const item of projectPluginTimelineItems(input.head, input.transform, "streaming")) {
      const blocks = presentRows(item);
      head.push(...blocks);
    }
    // Groupon Desk: a display mode filters flat rows, so a failed call never hides in a group.
    const displayMode = input.displayMode ?? "all";
    const level = displayMode === "all" ? input.level : "detailed";
    if (preparedTail !== historyRows || preparedLevel !== level) {
      preparedHistory = prepareToolCallHistory(level, historyRows);
      preparedTail = historyRows;
      preparedLevel = level;
    }
    const projection = projectToolCallDetailLevel({
      level,
      tail: historyRows,
      head,
      preparedHistory,
      isTurnActive: input.isTurnActive,
    });
    if (displayMode === "all") return projection;
    const showFailed = input.showFailed ?? true;
    if (
      filteredSource !== projection.tail ||
      filteredMode !== displayMode ||
      filteredShowFailed !== showFailed ||
      filteredTurnActive !== input.isTurnActive
    ) {
      filteredTail = filterForDisplayMode(projection.tail, displayMode, showFailed);
      filteredSource = projection.tail;
      filteredMode = displayMode;
      filteredShowFailed = showFailed;
      filteredTurnActive = input.isTurnActive;
    }
    return {
      ...projection,
      tail: filteredTail,
      head: filterForDisplayMode(projection.head, displayMode, showFailed),
    };
  };
}

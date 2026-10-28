// Added for Groupon Desk (fork of Paseo, Apache-2.0): a review sent from the diff, shown in the chat with its files, lines and comments; a comment opens the diff at its line.

import { memo, useCallback, useMemo, useState, type ReactElement } from "react";
import { Text, View } from "react-native";
import { MessageSquareCode } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { PressHighlight } from "@/components/ui/press-highlight";
import type { Theme } from "@/styles/theme";
import {
  reviewCommentPlace,
  reviewScopeLabel,
  reviewTargetLine,
  type ReviewAttachment,
  type ReviewAttachmentComment,
} from "./review-attachment-model";
import { GROUPON_REVIEW_CARD } from "./strings";
import { useOpenReviewComment } from "./use-open-review-comment";

/**
 * Each comment's key: comments carry no id, so their place and text name them, with a count for
 * two alike.
 */
function reviewCommentKeys(
  comments: readonly ReviewAttachmentComment[],
): Map<ReviewAttachmentComment, string> {
  const seen = new Map<string, number>();
  const keys = new Map<ReviewAttachmentComment, string>();
  for (const comment of comments) {
    const base = `${comment.filePath}:${comment.side}:${comment.lineNumber}:${comment.body}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    keys.set(comment, `${base}#${count}`);
  }
  return keys;
}

/** Comments shown before "Show N more". */
const FIRST_COMMENTS = 4;

const ThemedReviewIcon = withUnistyles(MessageSquareCode);
const mutedColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export const ReviewAttachmentCard = memo(function ReviewAttachmentCard({
  attachment,
  serverId,
  agentId,
}: {
  attachment: ReviewAttachment;
  serverId?: string;
  agentId?: string;
}): ReactElement {
  const open = useOpenReviewComment(serverId, agentId);
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((current) => !current), []);
  const hidden = attachment.comments.length - FIRST_COMMENTS;
  const shown =
    expanded || hidden <= 0 ? attachment.comments : attachment.comments.slice(0, FIRST_COMMENTS);
  const commentKeys = useMemo(() => reviewCommentKeys(attachment.comments), [attachment.comments]);
  const heading = `${GROUPON_REVIEW_CARD.title} · ${GROUPON_REVIEW_CARD.comments(attachment.comments.length)} · ${reviewScopeLabel(attachment)}`;
  return (
    <View style={styles.card} testID="review-attachment-card">
      <View style={styles.heading}>
        <ThemedReviewIcon size={14} uniProps={mutedColor} />
        <Text style={styles.headingText} numberOfLines={1}>
          {heading}
        </Text>
      </View>
      {shown.map((comment) => (
        <ReviewCommentRow
          key={commentKeys.get(comment)}
          attachment={attachment}
          comment={comment}
          onOpen={open}
        />
      ))}
      {hidden > 0 ? (
        <PressHighlight onPress={toggle} accessibilityRole="button" testID="review-attachment-more">
          <Text style={styles.more}>
            {expanded ? GROUPON_REVIEW_CARD.fewer : GROUPON_REVIEW_CARD.more(hidden)}
          </Text>
        </PressHighlight>
      ) : null}
    </View>
  );
});

const ReviewCommentRow = memo(function ReviewCommentRow({
  attachment,
  comment,
  onOpen,
}: {
  attachment: ReviewAttachment;
  comment: ReviewAttachmentComment;
  onOpen: ((attachment: ReviewAttachment, comment: ReviewAttachmentComment) => void) | null;
}): ReactElement {
  const place = reviewCommentPlace(comment);
  const target = reviewTargetLine(comment);
  const press = useCallback(() => onOpen?.(attachment, comment), [attachment, comment, onOpen]);
  const rowStyle = useCallback(
    ({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
      styles.row,
      hovered || pressed ? styles.rowActive : null,
    ],
    [],
  );
  const codeStyle = useMemo(
    () => [
      styles.code,
      target.type === "add" ? styles.codeAdd : null,
      target.type === "remove" ? styles.codeRemove : null,
    ],
    [target.type],
  );
  return (
    <PressHighlight
      onPress={onOpen ? press : undefined}
      disabled={!onOpen}
      style={rowStyle}
      accessibilityRole={onOpen ? "button" : undefined}
      accessibilityHint={onOpen ? GROUPON_REVIEW_CARD.openHint : undefined}
      testID="review-attachment-comment"
    >
      <Text style={styles.place} numberOfLines={1}>
        <Text style={styles.fileName}>{place.name}</Text>
        <Text style={styles.lineNumber}>{`:${place.line}`}</Text>
        {place.folder ? <Text style={styles.folder}>{`  ${place.folder}`}</Text> : null}
      </Text>
      <Text style={codeStyle} numberOfLines={1}>
        {`${target.marker} ${target.text}`}
      </Text>
      <Text style={styles.body} numberOfLines={4} selectable>
        {comment.body}
      </Text>
    </PressHighlight>
  );
});

const styles = StyleSheet.create((theme) => ({
  card: {
    gap: theme.spacing[1],
    minWidth: 260,
    maxWidth: 560,
    flexGrow: 1,
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    marginBottom: theme.spacing[1],
  },
  headingText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foregroundMuted,
    flexShrink: 1,
  },
  row: {
    gap: 2,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
  },
  rowActive: { backgroundColor: theme.colors.surface1 },
  place: { fontSize: theme.fontSize.sm, color: theme.colors.foreground },
  fileName: { fontWeight: theme.fontWeight.medium, color: theme.colors.foreground },
  lineNumber: { color: theme.colors.foregroundMuted },
  folder: { color: theme.colors.foregroundMuted },
  code: {
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
    color: theme.colors.foregroundMuted,
  },
  codeAdd: { color: theme.colors.statusSuccess },
  codeRemove: { color: theme.colors.statusDanger },
  body: { fontSize: theme.fontSize.sm, color: theme.colors.foreground },
  more: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    paddingVertical: theme.spacing[1],
  },
}));

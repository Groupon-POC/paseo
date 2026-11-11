// Added for Groupon Desk (fork of Paseo, Apache-2.0): New workspace's ticket step, above the composer in a repository that names branches from a Jira ticket.

/**
 * The ticket the new workspace is for, before anything is created: a key typed or taken from My
 * tasks, the branch `groupon ticket name` answers for it on the chosen Mac (or the helper's
 * reason), and Start a ticket beside it. The rule and the creation it leads to are
 * `ticket-branch-model.ts`.
 */

import { type ReactElement, useCallback, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { EditingTextInput } from "@/components/ui/text-input";
import { nameTicketBranch, type PluginRpcClient, pluginProblemText } from "./desk-plugin-rpc";
import { isChatsProjectRoot } from "./project-less-chats";
import { useRepositoryStandard } from "./repository-settings";
import { normalizeTicketKey } from "./start-ticket-model";
import { GROUPON_TICKET_BRANCH } from "./strings";
import {
  type CheckoutLike,
  namesBranchesFromTicket,
  type TicketBranch,
  type TicketCreation,
  type TicketRule,
  ticketBranchAfter,
  ticketCreationOf,
  ticketRuleOf,
} from "./ticket-branch-model";

const ThemedSpinner = withUnistyles(LoadingSpinner, (theme) => ({
  color: theme.colors.foregroundMuted,
}));

/** The step's state and its one action: name the branch for a key (an empty key clears it). */
export function useTicketBranch(client: PluginRpcClient | null): {
  step: TicketBranch;
  pick: (typed: string) => void;
} {
  const [step, setStep] = useState<TicketBranch>({ status: "empty" });
  const asked = useRef<string | null>(null);
  const pick = useCallback(
    (typed: string) => {
      const trimmed = typed.trim();
      const ticket = normalizeTicketKey(trimmed) ?? trimmed;
      if (ticket === asked.current) return;
      asked.current = ticket || null;
      if (!ticket) {
        setStep({ status: "empty" });
        return;
      }
      setStep({ status: "naming", ticket });
      if (!client) {
        setStep({ status: "refused", ticket, reason: "This Mac is not connected." });
        return;
      }
      nameTicketBranch(client, ticket)
        .then((answer) => setStep((current) => ticketBranchAfter(current, ticket, answer)))
        .catch((error: unknown) =>
          setStep((current) =>
            ticketBranchAfter(current, ticket, {
              kind: "refused",
              reason: pluginProblemText(error),
            }),
          ),
        );
    },
    [client],
  );
  return { step, pick };
}

/** What New workspace reads of the ticket step: its rule, the step above the composer, My tasks' Take, the creation. */
export interface NewWorkspaceTicket {
  rule: TicketRule;
  element: ReactElement | null;
  /** My tasks' Take: fills the step where the repository needs a ticket, else opens Start a ticket. */
  takeTicket: (ticket: string) => void;
  /** The creation for the picked base; throws `TICKET_REQUIRED` while a required ticket has no branch. */
  creationFor: (checkout: CheckoutLike | undefined) => TicketCreation;
}

export function useNewWorkspaceTicket(input: {
  client: PluginRpcClient | null;
  serverId: string;
  sourceDirectory: string | null;
  /** Without workspace multiplicity every workspace is a worktree. */
  supportsWorkspaceMultiplicity: boolean;
  isolation: "local" | "worktree";
  checkout: CheckoutLike | undefined;
  disabled: boolean;
  startTicket: { open: () => void; openFor: (ticket: string) => void };
}): NewWorkspaceTicket {
  const { client, serverId, sourceDirectory, checkout, disabled } = input;
  const createsWorktree = !input.supportsWorkspaceMultiplicity || input.isolation === "worktree";
  const { open: openStartTicket, openFor: openStartTicketFor } = input.startTicket;
  const repository = sourceDirectory && !isChatsProjectRoot(sourceDirectory) ? sourceDirectory : "";
  const standard = useRepositoryStandard(client, serverId, repository);
  const { step, pick } = useTicketBranch(client);
  const [field, setField] = useState({ key: 0, ticket: "" });
  const rule = ticketRuleOf({
    namesFromTicket: Boolean(repository) && namesBranchesFromTicket(standard.answer),
    createsWorktree,
    checkout,
  });
  const takeTicket = useCallback(
    (ticket: string) => {
      if (rule === "none") {
        openStartTicketFor(ticket);
        return;
      }
      setField((current) => ({ key: current.key + 1, ticket }));
      pick(ticket);
    },
    [openStartTicketFor, pick, rule],
  );
  const creationFor = useCallback(
    (picked: CheckoutLike | undefined) => ticketCreationOf({ rule, step, checkout: picked }),
    [rule, step],
  );
  const element = useMemo(
    () => (
      <TicketBranchStep
        key={field.key}
        rule={rule}
        step={step}
        initialTicket={field.ticket}
        onPick={pick}
        onStartTicket={openStartTicket}
        disabled={disabled}
      />
    ),
    [disabled, field, openStartTicket, pick, rule, step],
  );
  return useMemo(
    () => ({ rule, element, takeTicket, creationFor }),
    [creationFor, element, rule, takeTicket],
  );
}

export function TicketBranchStep({
  rule,
  step,
  initialTicket,
  onPick,
  onStartTicket,
  disabled,
}: {
  rule: TicketRule;
  step: TicketBranch;
  /** The key the field opens with; the page remounts the step (its `key`) when My tasks fills it. */
  initialTicket: string;
  onPick: (typed: string) => void;
  onStartTicket: () => void;
  disabled: boolean;
}) {
  const [typed, setTyped] = useState(initialTicket);
  const commit = useCallback(() => onPick(typed), [onPick, typed]);
  if (rule === "none") return null;
  return (
    <View style={styles.step} testID="new-workspace-ticket-step">
      <Text style={styles.muted}>
        {rule === "required" ? GROUPON_TICKET_BRANCH.required : GROUPON_TICKET_BRANCH.optional}
      </Text>
      <View style={styles.row}>
        <Text style={styles.label}>{GROUPON_TICKET_BRANCH.label}</Text>
        <EditingTextInput
          initialValue={initialTicket}
          onChangeText={setTyped}
          onSubmitEditing={commit}
          onBlur={commit}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!disabled}
          placeholder={GROUPON_TICKET_BRANCH.placeholder}
          style={styles.input}
          testID="new-workspace-ticket-key"
        />
        <Button
          variant="ghost"
          size="sm"
          onPress={onStartTicket}
          disabled={disabled}
          testID="new-workspace-ticket-start"
        >
          {GROUPON_TICKET_BRANCH.startTicket}
        </Button>
      </View>
      <TicketBranchLine step={step} />
    </View>
  );
}

function TicketBranchLine({ step }: { step: TicketBranch }) {
  switch (step.status) {
    case "empty":
      return null;
    case "naming":
      return (
        <View style={styles.row} testID="new-workspace-ticket-naming">
          <ThemedSpinner size={14} />
          <Text style={styles.muted}>{GROUPON_TICKET_BRANCH.naming}</Text>
        </View>
      );
    case "named":
      return (
        <Text style={styles.branch} testID="new-workspace-ticket-branch" selectable>
          {GROUPON_TICKET_BRANCH.branch}: {step.branch}
        </Text>
      );
    case "refused":
      return (
        <Text style={styles.error} testID="new-workspace-ticket-refused">
          {step.reason}
        </Text>
      );
    default: {
      const exhaustive: never = step;
      return exhaustive;
    }
  }
}

const styles = StyleSheet.create((theme) => ({
  step: {
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[3],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  label: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  muted: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  branch: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.mono,
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
}));

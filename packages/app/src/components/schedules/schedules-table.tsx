import { placeCronGroup, portableCron } from "@/groupon/cron-schedules";
import { getHostRuntimeStore, useHosts } from "@/runtime/host-runtime";
import { useToast } from "@/contexts/toast-context";
import { useQueryClient } from "@tanstack/react-query";
import { schedulesQueryBaseKey } from "@/schedules/aggregated-schedules";
import { MenuRoot, MenuTrigger, MenuSurface, MenuItem } from "@/components/ui/menu";
import { Text } from "react-native";
import { useCallback, useMemo, useState, type ReactElement } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ScheduleRow, type ScheduleRowPending } from "@/components/schedules/schedule-row";
import { useScheduleMutations } from "@/hooks/use-schedule-mutations";
import type { AggregatedSchedule } from "@/hooks/use-schedules";
import type { ScheduleDerivedState } from "@/schedules/schedule-derivation";
import { settingsStyles } from "@/styles/settings";
import { confirmDialog } from "@/utils/confirm-dialog";
import { resolveScheduleTitle, scheduleProductName } from "@/utils/schedule-format";

/** A schedule plus the client-derived fields the row renders. */
export interface ScheduleRowView {
  schedule: AggregatedSchedule;
  copies?: AggregatedSchedule[];
  targetLabel: string;
  provider: string | null;
  state: ScheduleDerivedState;
  serverName: string;
  /** True when only one host exists, so the host name is redundant in rows. */
  singleHost: boolean;
}

interface SchedulesTableProps {
  rows: ScheduleRowView[];
  canPlaceSharedCrons?: boolean;
  /**
   * The form sheet is owned by the screen (it serves both create and edit and
   * shares the screen's "New schedule" button), so the table delegates edit
   * upward rather than mounting a second sheet here.
   */
  onEditSchedule: (schedule: AggregatedSchedule) => void;
}

/**
 * The schedules list: a single settings-style card of rows across every
 * connected host, in a full-width list matching the History screen. Rows own
 * their host-scoped mutations (pause/resume/run/delete via the mutations hook +
 * a destructive confirm) and delegate editing upward.
 */
export function SchedulesTable({
  rows,
  onEditSchedule,
  canPlaceSharedCrons = false,
}: SchedulesTableProps): ReactElement {
  return (
    <View style={styles.listContent} testID="schedules-table">
      <View style={settingsStyles.card}>
        {rows.map((row, index) => (
          <SchedulesTableRow
            key={`${row.schedule.serverId}:${row.schedule.id}`}
            row={row}
            canPlaceSharedCrons={canPlaceSharedCrons}
            isFirst={index === 0}
            onEditSchedule={onEditSchedule}
          />
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Per-row wrapper owns local in-flight state and binds mutations to this
// schedule's host. Local state keeps pending precise to the acting row even
// when several rows are acted on at once (the mutations hook exposes only a
// single global pending flag per action).
// ---------------------------------------------------------------------------

const NO_PENDING: ScheduleRowPending = {};

function SchedulesTableRow({
  row,
  canPlaceSharedCrons,
  isFirst,
  onEditSchedule,
}: {
  row: ScheduleRowView;
  canPlaceSharedCrons: boolean;
  isFirst: boolean;
  onEditSchedule: (schedule: AggregatedSchedule) => void;
}): ReactElement {
  const { schedule } = row;
  const { id, serverId } = schedule;
  const copies = useMemo(() => row.copies ?? [schedule], [row.copies, schedule]);
  const shared = copies.every(portableCron);
  const hosts = useHosts();
  const runtime = getHostRuntimeStore();
  const query = useQueryClient();
  const toast = useToast();
  const [pending, setPending] = useState<ScheduleRowPending>(NO_PENDING);
  const move = useCallback(
    async (target: AggregatedSchedule | null) => {
      setPending((current) => ({ ...current, resume: true, pause: true }));
      try {
        await placeCronGroup({
          copies,
          target,
          getClient: (targetServerId) => runtime.getClient(targetServerId),
          isOnline: (targetServerId) =>
            runtime.getSnapshot(targetServerId)?.connectionStatus === "online",
          allHostsLoaded:
            canPlaceSharedCrons &&
            hosts.every(
              (host) => runtime.getSnapshot(host.serverId)?.connectionStatus === "online",
            ),
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not change the cron computer.");
      } finally {
        setPending(NO_PENDING);
        await query.invalidateQueries({ queryKey: schedulesQueryBaseKey });
      }
    },
    [copies, hosts, runtime, toast, query, canPlaceSharedCrons],
  );
  const mutations = useScheduleMutations({ serverId });

  const runAction = useCallback(
    async (key: keyof ScheduleRowPending, action: () => Promise<void>): Promise<void> => {
      setPending((current) => ({ ...current, [key]: true }));
      try {
        await action();
      } catch {
        // Mutations roll back their own optimistic cache writes on error and
        // re-fetch on settle; surfacing per-row toasts here is out of scope.
      } finally {
        setPending((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
      }
    },
    [],
  );

  const handleEdit = useCallback(() => {
    onEditSchedule(schedule);
  }, [onEditSchedule, schedule]);

  const handlePause = useCallback(() => {
    if (shared) {
      void move(null);
      return;
    }
    void runAction("pause", () => mutations.pauseSchedule(id));
  }, [runAction, mutations, id, shared, move]);

  const handleResume = useCallback(() => {
    if (shared) {
      void move(schedule);
      return;
    }
    void runAction("resume", () => mutations.resumeSchedule(id));
  }, [runAction, mutations, id, shared, move, schedule]);

  const handleRunNow = useCallback(() => {
    void runAction("runNow", () => mutations.runScheduleNow(id));
  }, [runAction, mutations, id]);

  const handleDelete = useCallback(() => {
    void (async () => {
      const productName = scheduleProductName(schedule);
      const confirmed = await confirmDialog({
        title: `Delete ${productName.toLowerCase()}`,
        message: `Delete "${resolveScheduleTitle(schedule)}"? This cannot be undone.`,
        confirmLabel: "Delete",
        destructive: true,
      });
      if (!confirmed) {
        return;
      }
      await runAction("delete", () => mutations.deleteSchedule(id));
    })();
  }, [runAction, mutations, id, schedule]);

  return (
    <View>
      <ScheduleRow
        serverId={row.schedule.serverId}
        schedule={schedule}
        targetLabel={row.targetLabel}
        provider={row.provider}
        state={row.state}
        serverName={row.serverName}
        singleHost={row.singleHost}
        isFirst={isFirst}
        pending={pending}
        onEdit={handleEdit}
        onPause={handlePause}
        onResume={handleResume}
        onRunNow={handleRunNow}
        onDelete={handleDelete}
      />
      {shared && (row.state === "active" || row.state === "paused") ? (
        <View style={styles.placement}>
          <MenuRoot compactMode="sheet">
            <MenuTrigger
              disabled={Boolean(pending.pause || pending.resume)}
              accessibilityLabel={`Choose computer for ${resolveScheduleTitle(schedule)}`}
            >
              <Text style={styles.placementText}>
                {pending.pause || pending.resume
                  ? "Saving computer choice..."
                  : "Activate on a computer..."}
              </Text>
            </MenuTrigger>
            <MenuSurface sheetTitle="Run this cron on">
              {copies
                .filter(
                  (copy, index) =>
                    copies.findIndex((other) => other.serverId === copy.serverId) === index,
                )
                .map((copy) => (
                  <CronComputerChoice key={copy.serverId} copy={copy} onMove={move} />
                ))}
            </MenuSurface>
          </MenuRoot>
        </View>
      ) : null}
    </View>
  );
}

function CronComputerChoice({
  copy,
  onMove,
}: {
  copy: AggregatedSchedule;
  onMove: (copy: AggregatedSchedule) => Promise<void>;
}) {
  const select = useCallback(() => {
    void onMove(copy);
  }, [copy, onMove]);
  return <MenuItem onSelect={select}>{copy.serverName}</MenuItem>;
}

const styles = StyleSheet.create((theme) => ({
  placement: { paddingHorizontal: theme.spacing[6], paddingBottom: theme.spacing[3] },
  placementText: { color: theme.colors.accent, fontSize: theme.fontSize.sm },
  // Full-width list padding matching the History screen.
  listContent: {
    paddingHorizontal: { xs: theme.spacing[3], md: theme.spacing[6] },
  },
}));

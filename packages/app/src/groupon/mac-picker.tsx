// Added for Groupon Desk (fork of Paseo, Apache-2.0): New workspace's "On <Mac>" picker.

/**
 * The list behind New workspace's "On <Mac>" field: the person's Macs from the hub, this Mac
 * first; a Mac that cannot take the task (its hand not running, still connecting) is greyed with
 * the reason and cannot be chosen. The model is `mac-picker-model.ts`.
 *
 * A Mac whose hand cannot find a tool carries small amber labels ("gh missing") after its name's row.
 *
 * Constraints:
 * - Only a connected Mac reaches `onSelect`, by its host's server id
 */

import { useCallback, useMemo, type ReactElement, type ReactNode, type RefObject } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { HostStatusDotSlot } from "@/components/hosts/host-picker";
import { Combobox, ComboboxItem, type ComboboxProps } from "@/components/ui/combobox";
import type { MacPickerOption } from "./mac-picker-model";
import { MissingToolLabels } from "./missing-tool-labels";
import { GROUPON_MAC_PICKER } from "./strings";

type RenderOption = NonNullable<ComboboxProps["renderOption"]>;

export interface MacPickerProps {
  options: readonly MacPickerOption[];
  selectedServerId: string;
  onSelect: (serverId: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorRef: RefObject<View | null>;
  /** The trigger, "On <Mac>". */
  children: ReactNode;
}

export function MacPicker({
  options,
  selectedServerId,
  onSelect,
  open,
  onOpenChange,
  anchorRef,
  children,
}: MacPickerProps): ReactElement {
  const byId = useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);
  const comboboxOptions = useMemo(
    () => options.map((option) => ({ id: option.id, label: option.label })),
    [options],
  );
  const value = options.find((option) => option.serverId === selectedServerId)?.id ?? "";

  const handleSelect = useCallback(
    (id: string) => {
      const serverId = byId.get(id)?.serverId;
      if (!serverId) return;
      onSelect(serverId);
      onOpenChange(false);
    },
    [byId, onOpenChange, onSelect],
  );

  const renderOption = useCallback<RenderOption>(
    ({ option, selected, active, onPress }) => (
      <MacOption
        mac={byId.get(option.id)}
        label={option.label}
        selected={selected}
        active={active}
        onPress={onPress}
      />
    ),
    [byId],
  );

  return (
    <>
      {children}
      <Combobox
        options={comboboxOptions}
        value={value}
        onSelect={handleSelect}
        renderOption={renderOption}
        title={GROUPON_MAC_PICKER.title}
        open={open}
        onOpenChange={onOpenChange}
        anchorRef={anchorRef}
        desktopPlacement="bottom-start"
        desktopMinWidth={260}
      />
    </>
  );
}

function MacOption({
  mac,
  label,
  selected,
  active,
  onPress,
}: {
  mac: MacPickerOption | undefined;
  label: string;
  selected: boolean;
  active: boolean;
  onPress: () => void;
}): ReactElement {
  const serverId = mac?.serverId ?? null;
  const leadingSlot = useMemo(
    () => (serverId ? <HostStatusDotSlot serverId={serverId} /> : <View style={styles.emptyDot} />),
    [serverId],
  );
  const trailingSlot = useMemo(
    () =>
      mac && mac.missingTools.length > 0 ? (
        <MissingToolLabels
          tools={mac.missingTools}
          testID={`new-workspace-mac-missing-${mac.id}`}
        />
      ) : undefined,
    [mac],
  );
  return (
    <ComboboxItem
      label={label}
      labelBadge={mac?.badge}
      description={mac?.note ?? undefined}
      leadingSlot={leadingSlot}
      trailingSlot={trailingSlot}
      selected={selected}
      active={active}
      disabled={!mac?.selectable}
      onPress={onPress}
      testID={`new-workspace-mac-picker-option-${mac?.id ?? label}`}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  emptyDot: {
    width: theme.iconSize.sm,
    height: theme.iconSize.sm,
  },
}));

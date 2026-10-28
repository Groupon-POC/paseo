// Changed for Groupon Desk (fork of Paseo, Apache-2.0): a `position` prop opens the list below its anchor, sized by the room below.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type RefObject,
} from "react";
import { View, useWindowDimensions } from "react-native";
import { Portal } from "@gorhom/portal";
import Animated, { useAnimatedReaction, useAnimatedStyle } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Autocomplete, type AutocompleteOption } from "@/components/ui/autocomplete";
import type { AutocompleteOptionsPosition } from "@/components/ui/autocomplete-utils";
import {
  measureFloatingPanelPortalHost,
  useFloatingPanelPortalHostName,
} from "@/components/ui/floating-panel-portal";
import { KeyboardTranslateView, useKeyboardAnchor, useKeyboardShift } from "@/keyboard/shift";
import { SPACING } from "@/styles/theme";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";

const OFFSET_FROM_ANCHOR = SPACING[3];

interface RelativeAnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
  hostHeight: number;
}

interface AutocompletePopoverProps {
  visible: boolean;
  anchorRef: RefObject<View | null>;
  options: readonly AutocompleteOption[];
  selectedIndex: number;
  onSelect: (option: AutocompleteOption) => void;
  isLoading?: boolean;
  errorMessage?: string;
  loadingText?: string;
  emptyText?: string;
  position?: AutocompleteOptionsPosition;
}

export function AutocompletePopover({
  visible,
  anchorRef,
  options,
  selectedIndex,
  onSelect,
  isLoading,
  errorMessage,
  loadingText,
  emptyText,
  position = "above-input",
}: AutocompletePopoverProps): ReactElement | null {
  "use no memo";
  // React Compiler memoizes effect captures by reading SharedValue.value during render.
  const [relativeAnchorRect, setRelativeAnchorRect] = useState<RelativeAnchorRect | null>(null);
  const windowDimensions = useWindowDimensions();
  const safeAreaInsets = useSafeAreaInsets();
  const portalHostName = useFloatingPanelPortalHostName();
  const { isMoving } = useKeyboardShift();
  const anchor = useKeyboardAnchor();
  const { measureAtRest } = anchor;
  const measurementGeneration = useRef(0);
  const canMeasure = visible && (options.length === 0 || selectedIndex >= 0);

  const remeasure = useCallback(() => {
    if (!canMeasure) return;
    const anchorElement = anchorRef.current;
    if (!anchorElement) return;
    const generation = measurementGeneration.current;
    void Promise.all([
      measureAtRest(anchorElement),
      measureFloatingPanelPortalHost(portalHostName),
    ]).then(([anchorRect, hostRect]) => {
      if (generation !== measurementGeneration.current || !anchorRect || !hostRect) {
        return undefined;
      }
      setRelativeAnchorRect({
        x: anchorRect.x - hostRect.x,
        y: anchorRect.y - hostRect.y,
        width: anchorRect.width,
        height: anchorRect.height,
        hostHeight: hostRect.height,
      });
      return undefined;
    });
  }, [anchorRef, canMeasure, measureAtRest, portalHostName]);

  useEffect(() => {
    measurementGeneration.current += 1;
    if (!canMeasure) {
      setRelativeAnchorRect(null);
      return;
    }

    remeasure();
    const raf = requestAnimationFrame(remeasure);

    return () => {
      measurementGeneration.current += 1;
      cancelAnimationFrame(raf);
    };
  }, [canMeasure, remeasure, windowDimensions.width, windowDimensions.height]);

  useAnimatedReaction(
    () => isMoving.value,
    (moving, wasMoving) => {
      if (wasMoving && !moving) {
        scheduleOnRN(remeasure);
      }
    },
    [isMoving, remeasure],
  );

  // Lay out at the anchor's resting position; the KeyboardTranslateView below lifts
  // it with the anchor. Height changes only at keyboard boundaries.
  const baseStyle = useMemo(() => {
    if (!relativeAnchorRect) return null;
    const vertical =
      position === "below-input"
        ? { top: relativeAnchorRect.y + relativeAnchorRect.height + OFFSET_FROM_ANCHOR }
        : { bottom: relativeAnchorRect.hostHeight - relativeAnchorRect.y + OFFSET_FROM_ANCHOR };
    return inlineUnistylesStyle({
      position: "absolute" as const,
      left: relativeAnchorRect.x,
      width: relativeAnchorRect.width,
      ...vertical,
    });
  }, [position, relativeAnchorRect]);

  const anchorY = relativeAnchorRect?.y ?? 0;
  const spaceBelow = relativeAnchorRect
    ? relativeAnchorRect.hostHeight - relativeAnchorRect.y - relativeAnchorRect.height
    : 0;
  const reservedLift = anchor.reservedLift;
  const heightStyle = useAnimatedStyle(
    () => ({
      maxHeight: Math.max(
        0,
        position === "below-input"
          ? spaceBelow - safeAreaInsets.bottom - OFFSET_FROM_ANCHOR * 2
          : anchorY - reservedLift.value - safeAreaInsets.top - OFFSET_FROM_ANCHOR * 2,
      ),
    }),
    [anchorY, position, reservedLift, safeAreaInsets.bottom, safeAreaInsets.top, spaceBelow],
  );

  if (!visible || !relativeAnchorRect || !baseStyle) return null;
  if (options.length > 0 && selectedIndex < 0) return null;

  // The translate view is the popover's own frame, so it lifts only the popover.
  return (
    <Portal hostName={portalHostName}>
      <KeyboardTranslateView {...anchor.translation} style={baseStyle}>
        <Animated.View testID="composer-autocomplete-popover" style={heightStyle}>
          <Autocomplete
            options={options}
            selectedIndex={selectedIndex}
            onSelect={onSelect}
            isLoading={isLoading}
            errorMessage={errorMessage}
            loadingText={loadingText}
            emptyText={emptyText}
            position={position}
          />
        </Animated.View>
      </KeyboardTranslateView>
    </Portal>
  );
}

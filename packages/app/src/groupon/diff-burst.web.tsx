// Added for Groupon Desk (fork of Paseo, Apache-2.0): when the session's diff grows, what it added appears above the diff pill, large, and is drawn into it.

/**
 * The pill's own count rolls to its new value, but a few lines on "+7.4k" hardly show. So each
 * time the count grows, the lines it grew by ("+12", "-3") appear above the pill, larger, and sink
 * into it, shrinking and fading. A CSS animation; nothing on the first count or when the pill
 * starts counting another workspace (`scope`).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { withUnistyles } from "react-native-unistyles";
import { formatDiffCount } from "@/git/file-header-presentation";
import type { Theme } from "@/styles/theme";

const BURST_MS = 750;
/** How far a burst may start off the pill's centre, and how far it may lean. */
const DRIFT_PX = 18;
const TILT_DEG = 9;

// It fades in close above the pill, a little off centre and leaning, and from there falls
// straight into it, faster and smaller as it goes: no pause on the way.
const KEYFRAMES = `@keyframes groupon-diff-burst {
  0% { opacity: 0; transform: translate(calc(-50% + var(--burst-x)), -22px) rotate(var(--burst-tilt)) scale(1.3); }
  12% { opacity: 1; transform: translate(calc(-50% + var(--burst-x)), -20px) rotate(var(--burst-tilt)) scale(1.27); }
  100% { opacity: 0; transform: translate(-50%, 6px) rotate(0deg) scale(0.25); }
}`;

const HOST: CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: "100%",
  width: 0,
  height: 0,
  overflow: "visible",
  pointerEvents: "none",
  zIndex: 5,
};

interface Burst {
  id: number;
  added: number;
  removed: number;
  /** Where this one starts and how it leans: a little different each time. */
  place: CSSProperties;
}

const spread = (limit: number) => (Math.random() * 2 - 1) * limit;

function DiffBurstView({
  additions,
  deletions,
  scope,
  addedColor,
  removedColor,
  haloColor,
}: {
  additions: number;
  deletions: number;
  scope: string;
  addedColor: string;
  removedColor: string;
  haloColor: string;
}): ReactElement | null {
  const lastRef = useRef({ scope, additions, deletions });
  const nextIdRef = useRef(0);
  const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [bursts, setBursts] = useState<Burst[]>([]);
  const drop = useCallback(
    (id: number) => setBursts((current) => current.filter((burst) => burst.id !== id)),
    [],
  );

  useEffect(() => {
    const last = lastRef.current;
    lastRef.current = { scope, additions, deletions };
    if (last.scope !== scope) return;
    const added = Math.max(0, additions - last.additions);
    const removed = Math.max(0, deletions - last.deletions);
    if (added === 0 && removed === 0) return;
    nextIdRef.current += 1;
    const id = nextIdRef.current;
    const place = {
      "--burst-x": `${spread(DRIFT_PX).toFixed(1)}px`,
      "--burst-tilt": `${spread(TILT_DEG).toFixed(1)}deg`,
    } as CSSProperties;
    setBursts((current) => [...current.slice(-2), { id, added, removed, place }]);
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      drop(id);
    }, BURST_MS + 50);
    timersRef.current.add(timer);
  }, [additions, deletions, drop, scope]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, []);

  const styles = useMemo(
    () => ({
      burst: burstStyleWith(haloColor),
      added: { color: addedColor },
      removed: { color: removedColor },
    }),
    [addedColor, haloColor, removedColor],
  );
  if (bursts.length === 0) return null;
  return (
    <span style={HOST} aria-hidden data-testid="diff-burst">
      <style>{KEYFRAMES}</style>
      {bursts.map((burst) => (
        <BurstWords key={burst.id} burst={burst} base={styles.burst}>
          {burst.added > 0 ? (
            <span style={styles.added}>+{formatDiffCount(burst.added)}</span>
          ) : null}
          {burst.removed > 0 ? (
            <span style={styles.removed}>-{formatDiffCount(burst.removed)}</span>
          ) : null}
        </BurstWords>
      ))}
    </span>
  );
}

/** One burst: the shared look, and its own start and lean. */
function BurstWords({
  burst,
  base,
  children,
}: {
  burst: Burst;
  base: CSSProperties;
  children: ReactNode;
}): ReactElement {
  const style = useMemo(() => ({ ...base, ...burst.place }), [base, burst.place]);
  return <span style={style}>{children}</span>;
}

function burstStyleWith(haloColor: string): CSSProperties {
  return {
    position: "absolute",
    left: 0,
    bottom: 0,
    display: "inline-flex",
    gap: 6,
    whiteSpace: "nowrap",
    fontSize: 18,
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
    textShadow: `0 1px 8px ${haloColor}, 0 0 2px ${haloColor}`,
    animation: `groupon-diff-burst ${BURST_MS}ms cubic-bezier(0.5, 0, 0.8, 0.3) forwards`,
  };
}

const ThemedDiffBurst = withUnistyles(DiffBurstView);
const themeColors = (theme: Theme) => ({
  addedColor: theme.colors.statusSuccess,
  removedColor: theme.colors.statusDanger,
  haloColor: theme.colors.surface0,
});

export function DiffBurst(props: {
  additions: number;
  deletions: number;
  scope: string;
}): ReactElement {
  return <ThemedDiffBurst {...props} uniProps={themeColors} />;
}

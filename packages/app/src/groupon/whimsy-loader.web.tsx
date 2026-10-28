// Added for Groupon Desk (fork of Paseo, Apache-2.0): TARS's working loader, a morphing blob with a typed word, or the blob alone.
import {
  useEffect,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";

const WHIMSY = [
  "Flickering",
  "Somnambulating",
  "Percolating",
  "Ruminating",
  "Effervescing",
  "Marinating",
  "Noodling",
  "Puzzling",
  "Simmering",
  "Wrangling",
  "Conjuring",
  "Tinkering",
  "Whirring",
  "Pondering",
  "Transmuting",
  "Cogitating",
  "Reticulating",
  "Bamboozling",
  "Unspooling",
  "Fermenting",
  "Grouponing",
  "Couponing",
  "Haggling",
  "Dealmaking",
  "Bargain-hunting",
  "Gallivanting",
  "Caramelizing",
  "Spelunking",
  "Finagling",
  "Kerfuffling",
  "Discombobulating",
];

const VIEW = 50;
const CENTER = VIEW / 2;
const GHOST_SCALE = 1.12;
const AMPLITUDE = 0.3;
const POINTS = 8;
const FRAMES = 5;
const SEED = 7;
const SWELL = 0.08;
const TYPE_MS = 55;
const HOLD_MS = 1400;

function random(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10_000) / 10_000;
  };
}

interface Point {
  x: number;
  y: number;
}

/** Closed Catmull-Rom through the ring, as cubic segments so CSS can interpolate `d`. */
function toPath(ring: Point[]): string {
  const at = (i: number) => ring[(i + ring.length) % ring.length];
  const round = (value: number) => value.toFixed(2);
  let path = `M ${round(ring[0].x)} ${round(ring[0].y)}`;
  for (let i = 0; i < ring.length; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    path += ` C ${round(c1.x)} ${round(c1.y)} ${round(c2.x)} ${round(c2.y)} ${round(p2.x)} ${round(p2.y)}`;
  }
  return `${path} Z`;
}

function blobFrames(base: number): string[] {
  const next = random(SEED);
  const shapes: string[] = [];
  for (let frame = 0; frame < FRAMES; frame++) {
    const ring: Point[] = [];
    for (let i = 0; i < POINTS; i++) {
      const angle = (i / POINTS) * Math.PI * 2;
      const radius = base * (1 + AMPLITUDE * (next() * 2 - 1));
      ring.push({ x: CENTER + Math.cos(angle) * radius, y: CENTER + Math.sin(angle) * radius });
    }
    shapes.push(toPath(ring));
  }
  // Closing on the first shape keeps the loop seamless.
  return [...shapes, shapes[0]];
}

function useTypedWord(): { text: string; done: boolean } {
  const [word, setWord] = useState(() => WHIMSY[Math.floor(Math.random() * WHIMSY.length)]);
  const [shown, setShown] = useState(0);
  const [erasing, setErasing] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (!erasing && shown < word.length) {
      timer = setTimeout(() => setShown(shown + 1), TYPE_MS);
    } else if (!erasing) {
      timer = setTimeout(() => setErasing(true), HOLD_MS);
    } else if (shown > 0) {
      timer = setTimeout(() => setShown(shown - 1), TYPE_MS / 2);
    } else {
      // Never repeat the word that just left the screen.
      const rest = WHIMSY.filter((entry) => entry !== word);
      timer = setTimeout(() => {
        setWord(rest[Math.floor(Math.random() * rest.length)] ?? word);
        setErasing(false);
      }, TYPE_MS);
    }
    return () => clearTimeout(timer);
  }, [word, shown, erasing]);

  return { text: word.slice(0, shown), done: !erasing && shown === word.length };
}

interface BlobProps {
  size: number;
  /** Only the blob, with no typed word (the background tasks' pill). */
  wordless?: boolean;
  colors: [string, string, string];
  mutedColor: string;
  accentColor: string;
}

const WRAPPER_STYLE: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8 };

function Blob({
  size,
  colors,
  mutedColor,
  accentColor,
  wordless = false,
}: BlobProps): ReactElement {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [first, second, third] = colors;
  const { css, firstShape } = useMemo(() => {
    // Nothing may leave the box: the widest lobe, the ghost copy and the swell all fit inside it.
    const base = CENTER / ((1 + AMPLITUDE) * GHOST_SCALE * (1 + SWELL));
    const shapes = blobFrames(base);
    const morph = shapes
      .map(
        (shape, i) => `${((i / (shapes.length - 1)) * 100).toFixed(0)}% { d: path("${shape}"); }`,
      )
      .join("\n");
    const cycle = [first, second, third, first];
    const tint = cycle
      .map((color, i) => `${((i / (cycle.length - 1)) * 100).toFixed(0)}% { fill: ${color}; }`)
      .join("\n");
    return {
      css: `
@keyframes morph-${id} { ${morph} }
@keyframes tint-${id} { ${tint} }
@keyframes swell-${id} { 0%, 100% { transform: scale(${1 - SWELL}); } 50% { transform: scale(${1 + SWELL}); } }
@keyframes turn-${id} { to { transform: rotate(360deg); } }`,
      firstShape: shapes[0],
    };
  }, [first, second, third, id]);
  const styles = useMemo(() => {
    const origin = { transformOrigin: `${CENTER}px ${CENTER}px` };
    return {
      svg: { display: "block", flexShrink: 0, animation: `turn-${id} 9s linear infinite` },
      group: { ...origin, animation: `swell-${id} 2.6s ease-in-out infinite` },
      ghost: {
        ...origin,
        transform: `scale(${GHOST_SCALE}) rotate(24deg)`,
        animation: `morph-${id} 4.6s ease-in-out infinite reverse`,
      },
      body: {
        animation: `morph-${id} 4.6s ease-in-out infinite, tint-${id} 6.2s ease-in-out infinite`,
      },
      word: {
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 13,
        color: mutedColor,
      },
      caret: { marginLeft: 2, color: accentColor },
    } satisfies Record<string, CSSProperties>;
  }, [accentColor, id, mutedColor]);
  return (
    <span style={WRAPPER_STYLE} data-testid="whimsy-loader">
      <style>{css}</style>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        role="status"
        aria-label="Working"
        style={styles.svg}
      >
        <g style={styles.group}>
          <path d={firstShape} fill={first} opacity={0.28} style={styles.ghost} />
          <path d={firstShape} fill={first} style={styles.body} />
        </g>
      </svg>
      {wordless ? null : <TypedWord wordStyle={styles.word} caretStyle={styles.caret} />}
    </span>
  );
}

/** The word TARS types beside the blob, erased and replaced in turn. */
function TypedWord({
  wordStyle,
  caretStyle,
}: {
  wordStyle: CSSProperties;
  caretStyle: CSSProperties;
}): ReactElement {
  const typed = useTypedWord();
  return (
    <span style={wordStyle}>
      {typed.text}
      {typed.done ? "…" : ""}
      <span style={caretStyle}>▌</span>
    </span>
  );
}

const ThemedBlob = withUnistyles(Blob);
const themeColors = (theme: Theme) => ({
  colors: [theme.colors.accent, theme.colors.accentBright, theme.colors.statusSuccess] as [
    string,
    string,
    string,
  ],
  mutedColor: theme.colors.foregroundMuted,
  accentColor: theme.colors.accent,
});

export function WhimsyLoader({
  size = 20,
  wordless = false,
}: {
  fallback?: ReactNode;
  size?: number;
  wordless?: boolean;
}): ReactElement {
  return <ThemedBlob size={size} wordless={wordless} uniProps={themeColors} />;
}

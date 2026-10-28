// Changed for Groupon Desk (fork of Paseo, Apache-2.0): a file header parted from the file before it, its name heavier, and room after its path for the open button.
import { selectionRectangles } from "./hit-testing";
import {
  DIFF_BODY_BORDER_HEIGHT,
  expandedBodyBorderTop,
  fragmentWidthForRange,
  visibleRowRange,
} from "./model";
import { codeLineNumberTone, codeTextColor } from "./palette";
import {
  DIFF_FILE_HEADER_CONTENT_HEIGHT,
  DIFF_FILE_HEADER_HEIGHT,
  DIFF_FILE_HEADER_ICON_SIZE,
  DIFF_FILE_HEADER_LEFT,
  DIFF_FILE_HEADER_RIGHT,
  DIFF_FILE_HEADER_TEXT_GAP,
  allocateDiffHeaderTextWidths,
  diffFileChangeKind,
  directorySuffix,
  fileNameForPath,
  formatDiffCount,
} from "@/git/file-header-presentation";
import { reviewBackgroundPaint, reviewDividerHeight, reviewGapTop } from "./review-paint";
import type {
  DiffCell,
  DiffDocumentModel,
  DiffFileSection,
  DiffHeaderTypography,
  DiffLineRow,
  DiffPalette,
  DiffSelection,
  DiffTypography,
  TextMeasurer,
} from "./types";

const CODE_LEFT_PADDING = 8;

export interface PaintWebViewportInput {
  context: CanvasRenderingContext2D;
  model: DiffDocumentModel;
  palette: DiffPalette;
  typography: DiffTypography;
  headerTypography: DiffHeaderTypography;
  measureText: TextMeasurer;
  scrollTop: number;
  viewportWidth: number;
  viewportHeight: number;
  horizontalOffsets: ReadonlyMap<string, number>;
  selection: DiffSelection | null;
  activeHeaderPath: string | null;
  devicePixelRatio: number;
  paintTop?: number;
  paintHeight?: number;
}

export function paintWebViewport(input: PaintWebViewportInput): void {
  const { context } = input;
  const scale = input.devicePixelRatio;
  const paintTop = input.paintTop ?? 0;
  const paintHeight = input.paintHeight ?? input.viewportHeight;
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.save();
  context.beginPath();
  context.rect(0, paintTop, input.viewportWidth, paintHeight);
  context.clip();
  context.clearRect(0, paintTop, input.viewportWidth, paintHeight);
  context.fillStyle = input.palette.surface;
  context.fillRect(0, paintTop, input.viewportWidth, paintHeight);
  context.font = `${input.typography.size}px ${input.typography.family}`;
  context.textBaseline = "alphabetic";

  const range = visibleRowRange(input.model.rows, input.scrollTop + paintTop, paintHeight);
  for (let index = range.start; index < range.end; index += 1) {
    const row = input.model.rows[index];
    if (!row) continue;
    const y = row.top - input.scrollTop;
    if (row.kind === "status") {
      context.fillStyle = input.palette.foregroundMuted;
      context.fillText(row.label, 12, y + input.model.lineHeight + 6);
      continue;
    }
    paintLine({
      ...input,
      row,
      y,
      horizontalOffset: input.horizontalOffsets.get(row.path) ?? 0,
    });
  }

  context.fillStyle = input.palette.border;
  const paintDocumentTop = input.scrollTop + paintTop;
  const paintDocumentBottom = paintDocumentTop + paintHeight;
  for (const file of input.model.files) {
    const borderTop = expandedBodyBorderTop(file);
    const isVisible =
      borderTop !== null &&
      borderTop < paintDocumentBottom &&
      borderTop + DIFF_BODY_BORDER_HEIGHT > paintDocumentTop;
    if (!isVisible) continue;
    context.fillRect(0, borderTop - input.scrollTop, input.viewportWidth, DIFF_BODY_BORDER_HEIGHT);
  }

  for (const file of input.model.files) {
    if (
      file.headerHeight <= 0 ||
      file.top + file.headerHeight <= paintDocumentTop ||
      file.top >= paintDocumentBottom
    ) {
      continue;
    }
    paintWebFileHeader({
      context,
      file,
      palette: input.palette,
      typography: input.headerTypography,
      viewportWidth: input.viewportWidth,
      y: file.top - input.scrollTop,
      activePath: input.activeHeaderPath,
    });
  }

  if (input.selection) paintSelection(input, input.selection);
  context.restore();
}

export function paintWebFileHeader(input: {
  context: CanvasRenderingContext2D;
  file: DiffFileSection;
  palette: DiffPalette;
  typography: DiffHeaderTypography;
  viewportWidth: number;
  y: number;
  activePath: string | null;
}): void {
  const { context, file, palette, typography, viewportWidth, y } = input;
  context.fillStyle =
    input.activePath === file.path ? palette.headerActiveSurface : palette.headerSurface;
  context.fillRect(0, y, viewportWidth, DIFF_FILE_HEADER_HEIGHT);
  context.fillStyle = palette.headerBorder;
  // Groupon Desk: a line above each header but the first parts one file from the one before.
  if (file.fileIndex > 0) context.fillRect(0, y, viewportWidth, 1);
  context.fillRect(0, y + DIFF_FILE_HEADER_HEIGHT - 1, viewportWidth, 1);

  const layout = layoutWebFileHeader({ context, file, typography, viewportWidth });
  context.font = `${typography.statSize}px ${typography.family}`;
  const statBaseline = centeredTextBaseline(context, y + DIFF_FILE_HEADER_CONTENT_HEIGHT / 2);
  context.fillStyle = palette.statusSuccess;
  context.fillText(layout.statLabels[0], layout.statX, statBaseline);
  context.fillStyle = palette.statusDanger;
  context.fillText(layout.statLabels[1], layout.statX + layout.additionsWidth + 4, statBaseline);
  paintChangeIcon(
    context,
    file,
    layout.iconX,
    y + (DIFF_FILE_HEADER_CONTENT_HEIGHT - DIFF_FILE_HEADER_ICON_SIZE) / 2,
    palette,
  );

  context.font = headerNameFont(typography);
  const textBaseline = centeredTextBaseline(context, y + DIFF_FILE_HEADER_CONTENT_HEIGHT / 2);
  context.save();
  context.beginPath();
  context.rect(DIFF_FILE_HEADER_LEFT, y, layout.available, DIFF_FILE_HEADER_CONTENT_HEIGHT);
  context.clip();
  context.fillStyle = palette.foreground;
  context.fillText(layout.name, DIFF_FILE_HEADER_LEFT, textBaseline);
  if (layout.directory) {
    context.font = headerDirectoryFont(typography);
    context.fillStyle = palette.foregroundMuted;
    context.fillText(
      layout.directory,
      DIFF_FILE_HEADER_LEFT + layout.nameWidth + DIFF_FILE_HEADER_TEXT_GAP,
      textBaseline,
    );
  }
  context.restore();
}

/** Groupon Desk: the room kept after a header's path for the button that opens the whole file. */
export const DIFF_FILE_HEADER_OPEN_BUTTON_SIZE = 20;
const DIFF_FILE_HEADER_OPEN_BUTTON_ROOM = DIFF_FILE_HEADER_OPEN_BUTTON_SIZE + 4;

// Groupon Desk: the file's name is painted heavier than its folder, so a header reads at a glance.
function headerNameFont(typography: DiffHeaderTypography): string {
  return `600 ${typography.size}px ${typography.family}`;
}

function headerDirectoryFont(typography: DiffHeaderTypography): string {
  return `${typography.size}px ${typography.family}`;
}

interface WebFileHeaderLayout {
  iconX: number;
  statX: number;
  statLabels: [string, string];
  additionsWidth: number;
  available: number;
  name: string;
  nameWidth: number;
  directory: string;
  /** Where the painted path ends. */
  textEnd: number;
}

function layoutWebFileHeader(input: {
  context: CanvasRenderingContext2D;
  file: DiffFileSection;
  typography: DiffHeaderTypography;
  viewportWidth: number;
}): WebFileHeaderLayout {
  const { context, file, typography } = input;
  const iconX = input.viewportWidth - DIFF_FILE_HEADER_RIGHT - DIFF_FILE_HEADER_ICON_SIZE;
  const statLabels: [string, string] = [
    `+${formatDiffCount(file.file.additions)}`,
    `-${formatDiffCount(file.file.deletions)}`,
  ];
  context.font = `${typography.statSize}px ${typography.family}`;
  const additionsWidth = context.measureText(statLabels[0]).width;
  const statWidth = additionsWidth + 4 + context.measureText(statLabels[1]).width;
  const statX = iconX - 8 - statWidth;
  const available = Math.max(0, statX - DIFF_FILE_HEADER_LEFT - DIFF_FILE_HEADER_OPEN_BUTTON_ROOM);
  // React Native Web collapses the leading separator space at the start of the
  // directory Text node. Canvas does not, so paint only the visible glyphs.
  const fitted = fitHeaderText(
    context,
    typography,
    fileNameForPath(file.path),
    directorySuffix(file.path).trimStart(),
    available,
  );
  const textEnd =
    DIFF_FILE_HEADER_LEFT +
    Math.min(
      available,
      fitted.nameWidth + (fitted.directory ? DIFF_FILE_HEADER_TEXT_GAP + fitted.directoryWidth : 0),
    );
  return { iconX, statX, statLabels, additionsWidth, available, ...fitted, textEnd };
}

/**
 * Groupon Desk: where the button that opens the whole file sits in a file's header, just after
 * the painted path; measured with the fonts `paintWebFileHeader` paints with.
 */
export function webFileHeaderOpenButtonLeft(input: {
  context: CanvasRenderingContext2D;
  file: DiffFileSection;
  typography: DiffHeaderTypography;
  viewportWidth: number;
}): number {
  return layoutWebFileHeader(input).textEnd + 4;
}

function centeredTextBaseline(context: CanvasRenderingContext2D, centerY: number): number {
  const metrics = context.measureText("Mg");
  return centerY + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2 + 1;
}

function fitHeaderText(
  context: CanvasRenderingContext2D,
  typography: DiffHeaderTypography,
  fullName: string,
  fullDirectory: string,
  available: number,
): { name: string; nameWidth: number; directory: string; directoryWidth: number } {
  const measure = (text: string, font: string) => {
    context.font = font;
    return context.measureText(text).width;
  };
  const nameFont = headerNameFont(typography);
  const directoryFont = headerDirectoryFont(typography);
  const nameWidth = measure(fullName, nameFont);
  const directoryWidth = measure(fullDirectory, directoryFont);
  if (nameWidth + (fullDirectory ? DIFF_FILE_HEADER_TEXT_GAP + directoryWidth : 0) <= available) {
    return { name: fullName, nameWidth, directory: fullDirectory, directoryWidth };
  }
  const widths = allocateDiffHeaderTextWidths({ available, nameWidth, directoryWidth });
  context.font = nameFont;
  const name = truncateCanvasText(context, fullName, widths.name);
  const fittedNameWidth = context.measureText(name).width;
  context.font = directoryFont;
  const directory = truncateCanvasText(context, fullDirectory, widths.directory);
  return {
    name,
    nameWidth: fittedNameWidth,
    directory,
    directoryWidth: context.measureText(directory).width,
  };
}

function truncateCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  maximumWidth: number,
): string {
  if (context.measureText(text).width <= maximumWidth) return text;
  const ellipsis = "…";
  if (context.measureText(ellipsis).width > maximumWidth) return "";
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (context.measureText(`${text.slice(0, middle)}${ellipsis}`).width <= maximumWidth)
      low = middle;
    else high = middle - 1;
  }
  return `${text.slice(0, low)}${ellipsis}`;
}

function paintChangeIcon(
  context: CanvasRenderingContext2D,
  file: DiffFileSection,
  x: number,
  y: number,
  palette: DiffPalette,
): void {
  const change = diffFileChangeKind(file.file);
  context.save();
  context.translate(x, y);
  context.scale(DIFF_FILE_HEADER_ICON_SIZE / 24, DIFF_FILE_HEADER_ICON_SIZE / 24);
  if (change === "added") context.strokeStyle = palette.statusSuccess;
  else if (change === "deleted") context.strokeStyle = palette.statusDanger;
  else context.strokeStyle = palette.statusWarning;
  context.lineWidth = 2;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.roundRect(3, 3, 18, 18, 2);
  if (change === "added") {
    context.moveTo(8, 12);
    context.lineTo(16, 12);
    context.moveTo(12, 8);
    context.lineTo(12, 16);
  } else if (change === "deleted") {
    context.moveTo(8, 12);
    context.lineTo(16, 12);
  } else {
    context.moveTo(12, 12);
    context.lineTo(12.01, 12);
  }
  context.stroke();
  context.restore();
}

function paintLine(
  input: PaintWebViewportInput & {
    row: DiffLineRow;
    y: number;
    horizontalOffset: number;
  },
): void {
  const columnWidth = input.viewportWidth / input.row.cells.length;
  const file = input.model.files[input.row.fileIndex];
  if (!file) return;
  input.row.cells.forEach((cell, cellIndex) => {
    const x = cellIndex * columnWidth;
    input.context.fillStyle = cellBackground(cell, input.palette);
    input.context.fillRect(x, input.y, columnWidth, input.row.height);
    if (input.row.reviewHeight > 0) {
      input.context.fillStyle = reviewBackgroundPaint(input.palette.surface);
      input.context.fillRect(
        x,
        reviewGapTop(input.y, input.row.height, input.row.reviewHeight),
        columnWidth,
        input.row.reviewHeight,
      );
    }
    if (!cell) return;
    input.context.fillStyle = input.palette.border;
    input.context.fillRect(x + file.gutterWidth, input.y, 1, reviewDividerHeight(input.row.height));
    if (cell.lineNumber !== null) {
      const label = String(cell.lineNumber);
      input.context.fillStyle = lineNumberColor(cell, input.palette);
      input.context.fillText(
        label,
        x + file.gutterWidth - 7 - input.measureText.measure(label),
        input.y + input.model.lineHeight * 0.78,
      );
    }
    input.context.save();
    input.context.beginPath();
    input.context.rect(
      x + file.gutterWidth + CODE_LEFT_PADDING,
      input.y,
      columnWidth - file.gutterWidth - CODE_LEFT_PADDING,
      input.row.height - input.row.reviewHeight,
    );
    input.context.clip();
    paintCellText({ ...input, cell, x: x + file.gutterWidth + CODE_LEFT_PADDING });
    input.context.restore();
  });
}

function paintCellText(
  input: PaintWebViewportInput & {
    row: DiffLineRow;
    cell: DiffCell;
    x: number;
    y: number;
    horizontalOffset: number;
  },
): void {
  const offset = input.model.wrapLines ? 0 : input.horizontalOffset;
  for (const fragment of input.cell.fragments) {
    const baseline = input.y + fragment.baseline;
    const textX = input.x - offset;
    for (const band of fragmentColorBands(input.cell, fragment, input.palette)) {
      input.context.save();
      input.context.beginPath();
      input.context.rect(
        textX + band.x,
        input.y + fragment.top,
        band.width,
        input.model.lineHeight,
      );
      input.context.clip();
      input.context.fillStyle = band.color;
      // Keep the complete shaped string and origin used during measurement. Clipping changes
      // syntax color without breaking ligatures, kerning, or contextual forms into new runs.
      input.context.fillText(fragment.text, textX, baseline);
      input.context.restore();
    }
  }
}

function fragmentColorBands(
  cell: DiffCell,
  fragment: DiffCell["fragments"][number],
  palette: DiffPalette,
): Array<{ x: number; width: number; color: string }> {
  const ranges: Array<{ start: number; end: number; color: string }> = [];
  for (const grapheme of fragment.graphemes) {
    const syntaxRun = cell.tokens.find(
      (run) => run.start <= grapheme.start && grapheme.start < run.end,
    );
    const color = syntaxRun?.color ?? cellForeground(cell, palette);
    const previous = ranges.at(-1);
    if (previous?.color === color) previous.end = grapheme.end;
    else ranges.push({ start: grapheme.start, end: grapheme.end, color });
  }
  if (ranges.length === 0) {
    return [{ x: 0, width: Math.max(1, fragment.width), color: cellForeground(cell, palette) }];
  }
  return ranges.map((range) => ({
    x: fragmentWidthForRange(fragment, fragment.start, range.start),
    width: fragmentWidthForRange(fragment, range.start, range.end),
    color: range.color,
  }));
}

function paintSelection(input: PaintWebViewportInput, selection: DiffSelection): void {
  input.context.save();
  input.context.globalAlpha = 0.45;
  input.context.fillStyle = input.palette.selection;
  for (const rectangle of selectionRectangles({
    model: input.model,
    selection,
  })) {
    const file = input.model.files[rectangle.fileIndex];
    if (!file) continue;
    const x =
      rectangle.x - (input.model.wrapLines ? 0 : (input.horizontalOffsets.get(file.path) ?? 0));
    const y = rectangle.y - input.scrollTop;
    input.context.save();
    input.context.beginPath();
    input.context.rect(rectangle.clipX, y, rectangle.clipWidth, rectangle.height);
    input.context.clip();
    input.context.fillRect(x, y, rectangle.width, rectangle.height);
    input.context.restore();
  }
  input.context.restore();
}

function cellBackground(cell: DiffCell | null, palette: DiffPalette): string {
  if (!cell) return palette.emptyBackground;
  if (cell.type === "add") return palette.additionBackground;
  if (cell.type === "remove") return palette.deletionBackground;
  if (cell.type === "header") return palette.headerSurface;
  return palette.surface;
}

function cellForeground(cell: DiffCell, palette: DiffPalette): string {
  return codeTextColor(cell, palette);
}

function lineNumberColor(cell: DiffCell, palette: DiffPalette): string {
  return palette[codeLineNumberTone(cell)];
}

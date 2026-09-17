import { encode } from "uqr";

import type { AxisResult, TypeResult } from "@/lib/api";
import { AXIS_INFO, getDisplayStrength, getPoleBadge } from "@/lib/city-axes";
import {
  TYPE_IMAGE_HEIGHT,
  TYPE_IMAGE_WIDTH,
  type CityType,
} from "@/lib/city-types";

/**
 * WebKit silently drops raster images nested in an SVG `foreignObject`, which is how
 * DOM-to-image libraries rasterize. Composing on a canvas keeps the illustration.
 */

/**
 * The export keeps its own width instead of inheriting the asset's. The web illustration
 * is deliberately small so the result screen loads fast, and letting that decide the card
 * would shrink the QR's modules with it — the one part of the band a scanner has to read.
 */
const CARD_WIDTH = 1697;

/** Every band measure is a share of the sheet width, so the layout scales with the art. */
const BAND = {
  height: 0.219,
  padX: 0.042,
  padTop: 0.019,
  padBottom: 0.036,
  rowHeight: 0.0205,
  rowGap: 0.0115,
  barHeight: 0.0155,
  labelWidth: 0.11,
  labelGap: 0.015,
  qrSize: 0.12,
  qrGap: 0.034,
  brandSize: 0.035,
  captionSize: 0.022,
  brandGap: 0.016,
  ctaSize: 0.024,
};

/** The screen shows the export itself, so its slot has to reserve the exact shape. */
export const CARD_ASPECT =
  TYPE_IMAGE_WIDTH / (TYPE_IMAGE_HEIGHT + TYPE_IMAGE_WIDTH * BAND.height);

const WHITE = "#ffffff";
const WHITE_TRACK = "rgba(255, 255, 255, 0.24)";
const WHITE_DIM = "rgba(255, 255, 255, 0.62)";
const WHITE_CAPTION = "rgba(255, 255, 255, 0.75)";

const BRAND = "유스플랜AI";
const CAPTION = "인천시 2045 도시기본계획 도시유형테스트";
const CTA = "테스트 시작하기";

/** The quiet zone the QR spec requires, carried inside the matrix so the plate is it. */
const QR_BORDER = 4;

/** Poles and their share, or a null share when the axis was never evidenced. */
type BarRow = {
  win: string;
  lose: string;
  strength: number | null;
};

/** Reading the address off the page keeps the card correct wherever it is deployed. */
function participationUrl(): string {
  return window.location.origin;
}

/** Loading outside the DOM keeps the export independent of the card's layout state. */
async function loadIllustration(source: string): Promise<HTMLImageElement> {
  const illustration = new Image();
  illustration.src = source;
  await illustration.decode();

  return illustration;
}

/** A system fallback face would quietly ruin the card, so a missing bundle fails here. */
async function resolveFont(size: number): Promise<string> {
  await document.fonts.ready;
  const family = getComputedStyle(document.body)
    .fontFamily.split(",")[0]
    .trim();
  const faces = await document.fonts.load(`700 ${size}px ${family}`);

  if (faces.length === 0) {
    throw new Error("Bundled font could not be loaded");
  }

  return family;
}

/** The card must show the same numbers as the screen, so both read the same helpers. */
function toBarRow(result: AxisResult): BarRow {
  const info = AXIS_INFO[result.axis];
  const opposite = info.left.letter === result.letter ? info.right : info.left;

  return {
    win: getPoleBadge(result.axis, result.letter),
    lose: opposite.badge,
    // An unevidenced axis sits at its default pole, so a percentage here would
    // present a fallback as a measurement.
    strength:
      result.empty_axis && !result.nearest_quote
        ? null
        : getDisplayStrength(result.strength),
  };
}

/** The sheet is drawn to the card's width; only the caption band sits beneath it. */
export async function createTypeCard(
  type: CityType,
  typeResult: TypeResult,
): Promise<File> {
  const illustration = await loadIllustration(type.image);
  const width = CARD_WIDTH;
  const sheetHeight = Math.round(
    (width * illustration.naturalHeight) / illustration.naturalWidth,
  );
  const band = Math.round(width * BAND.height);
  const brandSize = Math.round(width * BAND.brandSize);
  const family = await resolveFont(brandSize);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = sheetHeight + band;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas context is unavailable");
  }

  // The sheet is enlarged to the card's width, so the default low-quality resampling
  // would show as stair-stepping on the stamp's outline.
  context.imageSmoothingQuality = "high";
  context.drawImage(illustration, 0, 0, width, sheetHeight);

  // The band reads its blue from the theme token so the card cannot drift from the app.
  const theme = getComputedStyle(document.documentElement);
  context.fillStyle = theme.getPropertyValue("--primary").trim();
  context.fillRect(0, sheetHeight, width, band);

  const padX = width * BAND.padX;
  const qrBox = width * BAND.qrSize;
  const rows = typeResult.axes.map(toBarRow);
  const rowHeight = width * BAND.rowHeight;
  const rowGap = width * BAND.rowGap;
  const barsHeight = rows.length * rowHeight + (rows.length - 1) * rowGap;
  const barsWidth = width - padX * 2 - qrBox - width * BAND.qrGap;
  // The code is taller than the four rows, so it sets the height the rows centre in.
  const mainHeight = Math.max(barsHeight, qrBox);
  const barsTop =
    sheetHeight + width * BAND.padTop + (mainHeight - barsHeight) / 2;

  const labelWidth = width * BAND.labelWidth;
  const labelGap = width * BAND.labelGap;
  const labelSize = Math.round(rowHeight);
  const barHeight = width * BAND.barHeight;
  const trackLeft = padX + labelWidth + labelGap;
  const trackWidth = barsWidth - (labelWidth + labelGap) * 2;

  context.textBaseline = "middle";
  rows.forEach((row, index) => {
    const { strength } = row;
    const centerY = barsTop + index * (rowHeight + rowGap) + rowHeight / 2;

    context.textAlign = "left";
    context.fillStyle = strength === null ? WHITE_DIM : WHITE;
    context.font = `${strength === null ? 600 : 800} ${labelSize}px ${family}`;
    context.fillText(
      strength === null ? row.win : `${row.win} ${strength}%`,
      padX,
      centerY,
    );

    context.textAlign = "right";
    context.fillStyle = WHITE_DIM;
    context.font = `600 ${labelSize}px ${family}`;
    context.fillText(
      strength === null ? row.lose : `${row.lose} ${100 - strength}%`,
      padX + barsWidth,
      centerY,
    );

    context.save();
    context.beginPath();
    context.roundRect(
      trackLeft,
      centerY - barHeight / 2,
      trackWidth,
      barHeight,
      barHeight / 2,
    );
    context.fillStyle = WHITE_TRACK;
    context.fill();

    if (strength !== null) {
      // Clipping to the pill rounds the outer end and leaves the junction square,
      // the way two spans inside an overflow-hidden track read.
      context.clip();
      context.fillStyle = WHITE;
      context.fillRect(
        trackLeft,
        centerY - barHeight / 2,
        (trackWidth * strength) / 100,
        barHeight,
      );
    }

    context.restore();
  });

  const qrCenterX = width - padX - qrBox / 2;
  const qrCenterY = barsTop + barsHeight / 2;

  // Whole-pixel modules only: a fractional module blurs exactly the edges a scanner
  // reads, so the plate shrinks to the rounded size instead of stretching to fit.
  const qr = encode(participationUrl(), { border: QR_BORDER, ecc: "M" });
  const moduleSize = Math.max(1, Math.floor(qrBox / qr.size));
  const plate = moduleSize * qr.size;
  const plateX = Math.round(qrCenterX - plate / 2);
  const plateY = Math.round(qrCenterY - plate / 2);

  // Dark modules on their own white plate, because inverting a code onto the blue is
  // what scanners refuse. The matrix carries its own border, so the plate is the code.
  context.fillStyle = WHITE;
  context.fillRect(plateX, plateY, plate, plate);
  context.fillStyle = theme.getPropertyValue("--foreground").trim();
  qr.data.forEach((row, rowIndex) =>
    row.forEach((dark, columnIndex) => {
      if (!dark) return;

      context.fillRect(
        plateX + columnIndex * moduleSize,
        plateY + rowIndex * moduleSize,
        moduleSize,
        moduleSize,
      );
    }),
  );

  // Brand, caption and call to action share one baseline, set from the bottom inset.
  const baseline = sheetHeight + band - width * BAND.padBottom;
  context.textBaseline = "alphabetic";
  context.textAlign = "left";
  context.fillStyle = WHITE;
  context.font = `800 ${brandSize}px ${family}`;
  context.fillText(BRAND, padX, baseline);

  const captionX =
    padX + context.measureText(BRAND).width + width * BAND.brandGap;
  context.fillStyle = WHITE_CAPTION;
  context.font = `500 ${Math.round(width * BAND.captionSize)}px ${family}`;
  context.fillText(CAPTION, captionX, baseline);

  // Centred on the code's axis, so the wider label spills evenly to both sides.
  context.textAlign = "center";
  context.fillStyle = WHITE;
  context.font = `800 ${Math.round(width * BAND.ctaSize)}px ${family}`;
  context.fillText(CTA, qrCenterX, baseline);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );

  if (!blob) {
    throw new Error("Share card could not be rasterized");
  }

  return new File([blob], `유스플랜AI-${type.nickname}.png`, {
    type: "image/png",
  });
}

/** Asking about the exact payload, since a target may accept the file but not the rest. */
function canShare(payload: ShareData): boolean {
  if (typeof navigator === "undefined" || !navigator.share) return false;

  return navigator.canShare?.(payload) ?? false;
}

function saveFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.download = file.name;
  link.href = url;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Desktop browsers without the Share API still get the card, as PLAN 9.3 requires. */
export async function shareTypeCard(
  file: File,
  nickname: string,
): Promise<void> {
  // No text: targets that render every field turn a caption into a third item next to
  // the card and the link, and the card already says what the caption would have.
  const payload: ShareData = {
    files: [file],
    title: `유스플랜AI ${nickname}`,
    url: participationUrl(),
  };

  if (!canShare(payload)) {
    saveFile(file);
    return;
  }

  await navigator.share(payload);
}

/** Direct download always saves the generated image without opening a share sheet. */
export function downloadTypeCard(file: File): void {
  saveFile(file);
}

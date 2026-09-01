import { encode } from "uqr";

import type { CityType } from "@/lib/city-types";

/**
 * WebKit silently drops raster images nested in an SVG `foreignObject`, which is how
 * DOM-to-image libraries rasterize. Composing on a canvas keeps the illustration.
 */
const BAND_RATIO = 0.19;
const BRAND = "유스플랜AI";
const CAPTION = "인천시 2045 도시기본계획 도시유형테스트";

/** A bare code says nothing about why it is there, so the band tells the reader. */
const QR_LABEL = ["찍으면 나도", "해볼 수 있어요"];

/** The quiet zone the QR spec requires, carried inside the matrix so the plate is it. */
const QR_BORDER = 4;

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

/** The sheet keeps its own pixels; only the caption band is drawn beneath it. */
async function createCardFile(type: CityType): Promise<File> {
  const illustration = await loadIllustration(type.image);
  const width = illustration.naturalWidth;
  const sheetHeight = illustration.naturalHeight;
  const band = Math.round(width * BAND_RATIO);
  const brandSize = Math.round(band * 0.22);
  const family = await resolveFont(brandSize);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = sheetHeight + band;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas context is unavailable");
  }

  context.drawImage(illustration, 0, 0);

  // The band reads its blue from the theme token so the card cannot drift from the app.
  const theme = getComputedStyle(document.documentElement);
  context.fillStyle = theme.getPropertyValue("--primary").trim();
  context.fillRect(0, sheetHeight, width, band);

  const inset = Math.round(width * 0.052);
  context.textBaseline = "alphabetic";
  context.fillStyle = "#ffffff";
  context.font = `700 ${brandSize}px ${family}`;
  context.fillText(BRAND, inset, sheetHeight + band * 0.45);
  context.fillStyle = "rgba(255, 255, 255, 0.72)";
  context.font = `500 ${Math.round(band * 0.145)}px ${family}`;
  context.fillText(CAPTION, inset, sheetHeight + band * 0.75);

  // Whole-pixel modules only: a fractional module blurs exactly the edges a scanner
  // reads, so the plate shrinks to the rounded size instead of stretching to fit.
  const qr = encode(participationUrl(), { border: QR_BORDER, ecc: "M" });
  const moduleSize = Math.max(1, Math.floor((band * 0.86) / qr.size));
  const plate = moduleSize * qr.size;
  const plateX = width - inset - plate;
  const plateY = sheetHeight + Math.round((band - plate) / 2);

  // Dark modules on their own white plate, because inverting a code onto the blue is
  // what scanners refuse. The matrix carries its own border, so the plate is the code.
  context.fillStyle = "#ffffff";
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

  const labelSize = Math.round(band * 0.105);
  const labelGap = Math.round(band * 0.125);
  context.fillStyle = "#ffffff";
  context.font = `600 ${labelSize}px ${family}`;
  context.textAlign = "right";
  context.textBaseline = "middle";
  QR_LABEL.forEach((line, index) => {
    const offset = (index - (QR_LABEL.length - 1) / 2) * labelGap;
    context.fillText(
      line,
      plateX - Math.round(band * 0.06),
      plateY + plate / 2 + offset,
    );
  });

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
export async function shareTypeCard(type: CityType): Promise<void> {
  const file = await createCardFile(type);
  // Some targets append the url to the text and some show only one of them, so the
  // text has to end well either way and must not carry the address itself.
  const payload: ShareData = {
    files: [file],
    title: `유스플랜AI ${type.nickname}`,
    text: "내가 바라는 2045년 인천의 도시유형이에요. 나도 해보기",
    url: participationUrl(),
  };

  if (!canShare(payload)) {
    saveFile(file);
    return;
  }

  await navigator.share(payload);
}

/** Direct download always saves the generated image without opening a share sheet. */
export async function downloadTypeCard(type: CityType): Promise<void> {
  saveFile(await createCardFile(type));
}

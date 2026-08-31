import type { CityType } from "@/lib/city-types";

/**
 * WebKit silently drops raster images nested in an SVG `foreignObject`, which is how
 * DOM-to-image libraries rasterize. Composing on a canvas keeps the illustration.
 */
const BAND_RATIO = 0.19;
const BRAND = "유스플랜AI";
const CAPTION = "인천시 2045 도시기본계획 도시유형테스트";

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

function canShareFiles(file: File): boolean {
  if (typeof navigator === "undefined" || !navigator.share) return false;

  return navigator.canShare?.({ files: [file] }) ?? false;
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

  if (!canShareFiles(file)) {
    saveFile(file);
    return;
  }

  await navigator.share({
    files: [file],
    title: `유스플랜AI ${type.nickname}`,
    text: "내가 바라는 2045년 인천의 도시유형이에요.",
  });
}

/** Direct download always saves the generated image without opening a share sheet. */
export async function downloadTypeCard(type: CityType): Promise<void> {
  saveFile(await createCardFile(type));
}

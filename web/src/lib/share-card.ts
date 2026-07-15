import { getFontEmbedCSS, toBlob } from "html-to-image";

/** Explicit font embedding prevents the exported bitmap from using a fallback face. */
async function createCardFile(
  node: HTMLDivElement,
  code: string,
): Promise<File> {
  await document.fonts.ready;
  const primaryFont = getComputedStyle(node).fontFamily.split(",")[0].trim();
  const loadedFaces = await document.fonts.load(`700 24px ${primaryFont}`);
  const fontEmbedCSS = await getFontEmbedCSS(node, {
    preferredFontFormat: "woff2",
  });

  if (loadedFaces.length === 0 || !fontEmbedCSS.includes("data:")) {
    throw new Error("Bundled font could not be embedded");
  }

  const blob = await toBlob(node, {
    backgroundColor: "#ffffff",
    fontEmbedCSS,
    pixelRatio: 3,
    preferredFontFormat: "woff2",
  });

  if (!blob) {
    throw new Error("Share card could not be rasterized");
  }

  return new File([blob], `유스플랜AI-${code}.png`, { type: "image/png" });
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
export async function shareTypeCard(
  node: HTMLDivElement,
  code: string,
): Promise<void> {
  const file = await createCardFile(node, code);

  if (!canShareFiles(file)) {
    saveFile(file);
    return;
  }

  await navigator.share({
    files: [file],
    title: `유스플랜AI ${code}`,
    text: "내가 바라는 2040년 인천의 도시 유형이에요.",
  });
}

/** Direct download always saves the generated image without opening a share sheet. */
export async function downloadTypeCard(
  node: HTMLDivElement,
  code: string,
): Promise<void> {
  saveFile(await createCardFile(node, code));
}

/**
 * Composing the downloadable PNG.
 *
 * The image is the city and an identity pill, nothing else. The month and
 * weekday labels are a DOM overlay rather than part of the scene, and are
 * deliberately left out: they read as chart furniture, and what gets sent
 * to someone is a picture of a city.
 */

/**
 * The export has its own frame: 4:5 portrait, rendered at 2x.
 *
 * Deliberately not the viewport's shape. The window is whatever shape the
 * window is, and a landscape browser produces a landscape image that
 * reads as a screenshot. A fixed portrait frame makes the download a
 * thing in its own right, and 4:5 is the tallest shape social feeds show
 * without cropping.
 *
 * Logical size drives the orthographic frustum; multiplied by the pixel
 * ratio it gives the PNG's real pixels — 1080x1350.
 */
export const EXPORT_PIXEL_RATIO = 2;
export const EXPORT_LOGICAL_WIDTH = 540;
export const EXPORT_LOGICAL_HEIGHT = 675;

/**
 * Fraction of the frame the city fills.
 *
 * Much more generous than the on-screen `zoomPadding`, which has to clear
 * the labels above and left of the grid and keep the city out from under
 * the controls. The PNG has none of that: the wordmark and the pill sit
 * at the very top and bottom, and the city is a wide, shallow ribbon that
 * never reaches either.
 *
 * The city is far wider than it is deep, so in a portrait frame this is
 * effectively the horizontal fill — `fitZoomForView` takes whichever of
 * the two axes binds, and it is always width here.
 */
export const EXPORT_ZOOM_PADDING = 0.94;

/** Pill geometry, in CSS pixels before the export scale is applied. */
const PILL_HEIGHT = 52;
const AVATAR_SIZE = 36;
const PILL_PAD_LEFT_WITH_AVATAR = 8;
const PILL_PAD_LEFT_TEXT_ONLY = 22;
const PILL_PAD_RIGHT = 22;
const AVATAR_TEXT_GAP = 10;
const PILL_BOTTOM_MARGIN = 36;
const PILL_FONT_SIZE = 16;

/**
 * The wordmark at the top, at 0.75x the pill's scale.
 *
 * Drawn as plain text rather than in a pill of its own, matching the
 * page header. The hierarchy is deliberate: whose city this is matters
 * more than what made it, so the identity gets the pill and the product
 * gets a quiet line above.
 */
const LOGO_SCALE = 0.75;
const LOGO_TEXT = "gitCity";

const PILL_BG = "#ffffff";
const PILL_BORDER = "rgba(23, 20, 18, 0.08)";
const PILL_TEXT = "#171412";
const PILL_SHADOW = "rgba(23, 20, 18, 0.10)";

/**
 * Filename for a download.
 *
 * Lowercased and stripped to the characters every filesystem accepts.
 * GitHub logins are already restricted to alphanumerics and hyphens, but
 * the period label is free text ("Last 12 months").
 */
export function exportFilename(login: string, periodLabel: string): string {
  const slug = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const parts = [slug(login), slug(periodLabel)].filter(Boolean);
  return `gitcity-${parts.join("-") || "city"}.png`;
}

/**
 * Loads an image the canvas is allowed to read back.
 *
 * Without `crossOrigin`, drawing a remote image taints the canvas and
 * every later read throws a SecurityError. Resolves null rather than
 * rejecting: a missing avatar should cost the pill its picture, not cost
 * the user their download.
 */
export function loadCrossOriginImage(
  url: string,
): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!url) {
      resolve(null);
      return;
    }

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/** The font the page is actually using, so the pill matches the site
 * rather than falling back to the canvas default. */
function bodyFontFamily(): string {
  if (typeof window === "undefined") return "sans-serif";
  const family = window.getComputedStyle(document.body).fontFamily;
  return family || "sans-serif";
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

/**
 * Draws the identity pill centred along the bottom of `ctx`.
 *
 * `scale` converts the CSS-pixel constants above into the export's own
 * pixels, so the pill keeps its proportions at any resolution.
 */
function drawIdentityPill(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  login: string,
  avatar: HTMLImageElement | null,
  scale: number,
) {
  const height = PILL_HEIGHT * scale;
  const avatarSize = AVATAR_SIZE * scale;
  const padLeft =
    (avatar ? PILL_PAD_LEFT_WITH_AVATAR : PILL_PAD_LEFT_TEXT_ONLY) * scale;
  const padRight = PILL_PAD_RIGHT * scale;
  const gap = avatar ? AVATAR_TEXT_GAP * scale : 0;

  const label = `@${login}`;
  ctx.font = `600 ${PILL_FONT_SIZE * scale}px ${bodyFontFamily()}`;
  const textWidth = ctx.measureText(label).width;

  const width =
    padLeft + (avatar ? avatarSize + gap : 0) + textWidth + padRight;
  const x = (canvasWidth - width) / 2;
  const y = canvasHeight - PILL_BOTTOM_MARGIN * scale - height;

  // Shadow belongs to the fill only, or it would be redrawn under the
  // border stroke and the avatar as well.
  ctx.save();
  ctx.shadowColor = PILL_SHADOW;
  ctx.shadowBlur = 12 * scale;
  ctx.shadowOffsetY = 3 * scale;
  ctx.fillStyle = PILL_BG;
  roundedRect(ctx, x, y, width, height, height / 2);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = PILL_BORDER;
  ctx.lineWidth = 1 * scale;
  roundedRect(ctx, x, y, width, height, height / 2);
  ctx.stroke();

  if (avatar) {
    const avatarX = x + padLeft;
    const avatarY = y + (height - avatarSize) / 2;

    ctx.save();
    ctx.beginPath();
    ctx.arc(
      avatarX + avatarSize / 2,
      avatarY + avatarSize / 2,
      avatarSize / 2,
      0,
      Math.PI * 2,
    );
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();
  }

  ctx.fillStyle = PILL_TEXT;
  ctx.textBaseline = "middle";
  ctx.fillText(
    label,
    x + padLeft + (avatar ? avatarSize + gap : 0),
    y + height / 2,
  );
}

/** Draws the wordmark centred along the top of `ctx`. */
function drawWordmark(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  scale: number,
) {
  ctx.font = `600 ${PILL_FONT_SIZE * LOGO_SCALE * scale}px ${bodyFontFamily()}`;
  ctx.fillStyle = PILL_TEXT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Mirrors the pill's own margin, scaled with it, so the two sit the
  // same distance from their respective edges.
  const centreY =
    PILL_BOTTOM_MARGIN * LOGO_SCALE * scale +
    (PILL_HEIGHT * LOGO_SCALE * scale) / 2;

  ctx.fillText(LOGO_TEXT, canvasWidth / 2, centreY);
  ctx.textAlign = "start";
}

/**
 * The city plus its pill, as a new canvas.
 *
 * `source` is a snapshot of the WebGL drawing buffer, already copied out
 * — see captureSceneCanvas in city-scene.tsx for why it can't be read
 * lazily.
 */
export function composeCityPng(
  source: HTMLCanvasElement,
  login: string,
  avatar: HTMLImageElement | null,
  scale: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.drawImage(source, 0, 0);
  drawWordmark(ctx, canvas.width, scale);
  drawIdentityPill(ctx, canvas.width, canvas.height, login, avatar, scale);

  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

/** Hands the file to the browser and releases the object URL once the
 * click has been dispatched. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoked on a later task: revoking synchronously can cancel the
  // download in some browsers before it has read the blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

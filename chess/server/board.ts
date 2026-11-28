// The board as an SVG picture: what a card's body shows and the page draws
// on. It is drawn from the placement field of a FEN alone, so its URL says
// everything it shows and it can be cached for good. The pieces are simple
// shapes drawn here, not a font, so every device shows the same board.

const LIGHT = "#ecdab9";
const DARK = "#ae8a68";
const MOVED = "rgba(246, 222, 90, 0.55)";
const CHECK = "rgba(220, 60, 50, 0.7)";
const SQUARE = 100;

// Each piece in a 100 × 100 square, drawn as one or more paths that are
// filled with the piece's colour and outlined with the other's.
const SHAPES: Record<string, string[]> = {
  p: [
    "M50 22a13 13 0 1 1 0 26a13 13 0 1 1 0-26z",
    "M38 50h24l6 26H32z",
    "M26 76h48a4 4 0 0 1 4 4v6H22v-6a4 4 0 0 1 4-4z",
  ],
  r: [
    "M27 18h11v8h6v-8h12v8h6v-8h11v20H27z",
    "M33 38h34v36H33z",
    "M24 74h52a4 4 0 0 1 4 4v8H20v-8a4 4 0 0 1 4-4z",
  ],
  n: [
    "M30 86h46c0-22-2-40-10-52c-6-9-14-14-20-16l-2-8l-6 10c-6 4-14 14-18 24l4 8l8-4l10-2c-2 12-10 20-12 40z",
    "M44 33a3 3 0 1 1 0 .1z",
  ],
  b: [
    "M50 8a6 6 0 1 1 0 12a6 6 0 1 1 0-12z",
    "M50 20c14 14 18 32 10 48H40c-8-16-4-34 10-48z",
    "M34 68h32v8H34z",
    "M24 78h52a4 4 0 0 1 4 4v4H20v-4a4 4 0 0 1 4-4z",
  ],
  q: [
    "M20 30l12 38h36l12-38l-14 18l-6-26l-10 24l-10-24l-6 26z",
    "M30 68h40v8H30z",
    "M24 78h52a4 4 0 0 1 4 4v4H20v-4a4 4 0 0 1 4-4z",
    "M20 24a5 5 0 1 1 0 10a5 5 0 1 1 0-10z",
    "M80 24a5 5 0 1 1 0 10a5 5 0 1 1 0-10z",
    "M50 16a5 5 0 1 1 0 10a5 5 0 1 1 0-10z",
  ],
  k: [
    "M46 6h8v8h8v8h-8v10h-8V22h-8v-8h8z",
    "M28 70c-6-18 6-34 22-34s28 16 22 34z",
    "M30 70h40v8H30z",
    "M24 78h52a4 4 0 0 1 4 4v4H20v-4a4 4 0 0 1 4-4z",
  ],
};

function pieceSvg(letter: string, x: number, y: number): string {
  const kind = letter.toLowerCase();
  const white = letter !== kind;
  const fill = white ? "#fbfbf8" : "#2b2b2b";
  const stroke = white ? "#2b2b2b" : "#0d0d0d";
  const paths = SHAPES[kind] ?? [];
  return (
    `<g transform="translate(${x} ${y})" fill="${fill}" stroke="${stroke}" stroke-width="3" stroke-linejoin="round">` +
    paths.map((d) => `<path d="${d}"/>`).join("") +
    "</g>"
  );
}

/** The 0–63 square (from a8) a name such as "e4" means, or -1. */
function cell(name: string | undefined): number {
  if (!name || !/^[a-h][1-8]$/.test(name)) return -1;
  return (8 - Number(name[1])) * 8 + (name.charCodeAt(0) - 97);
}

export interface BoardPicture {
  /** The placement field of a FEN. */
  placement: string;
  /** The last move in UCI, highlighted. */
  last?: string;
  /** A king in check, by square name. */
  check?: string;
  /** Black at the bottom. */
  flip?: boolean;
  /** The drawn width and height in pixels. */
  size?: number;
}

/** The 64 squares from a8, each a piece letter or "". Null for a bad placement. */
export function squares(placement: string): string[] | null {
  const rows = placement.split("/");
  if (rows.length !== 8) return null;
  const out: string[] = [];
  for (const row of rows) {
    let n = 0;
    for (const ch of row) {
      if (/[1-8]/.test(ch)) {
        for (let i = 0; i < Number(ch); i++) out.push("");
        n += Number(ch);
      } else if (/[pnbrqkPNBRQK]/.test(ch)) {
        out.push(ch);
        n++;
      } else {
        return null;
      }
    }
    if (n !== 8) return null;
  }
  return out;
}

/** The picture, or null when the placement is not one. */
export function boardSvg(picture: BoardPicture): string | null {
  const cells = squares(picture.placement);
  if (!cells) return null;
  const size = Math.min(800, Math.max(120, Math.round(picture.size ?? 360)));
  const marked = new Set<number>();
  if (picture.last && /^[a-h][1-8][a-h][1-8]/.test(picture.last)) {
    marked.add(cell(picture.last.slice(0, 2)));
    marked.add(cell(picture.last.slice(2, 4)));
  }
  const checked = cell(picture.check);
  const parts: string[] = [];
  for (let i = 0; i < 64; i++) {
    const row = Math.floor(i / 8);
    const col = i % 8;
    const drawRow = picture.flip ? 7 - row : row;
    const drawCol = picture.flip ? 7 - col : col;
    const x = drawCol * SQUARE;
    const y = drawRow * SQUARE;
    const light = (row + col) % 2 === 0;
    parts.push(
      `<rect x="${x}" y="${y}" width="${SQUARE}" height="${SQUARE}" fill="${light ? LIGHT : DARK}"/>`,
    );
    if (marked.has(i)) {
      parts.push(
        `<rect x="${x}" y="${y}" width="${SQUARE}" height="${SQUARE}" fill="${MOVED}"/>`,
      );
    }
    if (i === checked) {
      parts.push(
        `<circle cx="${x + 50}" cy="${y + 50}" r="46" fill="${CHECK}"/>`,
      );
    }
    if (cells[i]) parts.push(pieceSvg(cells[i], x, y));
  }
  // Coordinates along the bottom and left edges.
  for (let k = 0; k < 8; k++) {
    const file = "abcdefgh"[picture.flip ? 7 - k : k];
    const rank = String(picture.flip ? k + 1 : 8 - k);
    const onLight = (fileColour: number) =>
      fileColour % 2 === 0 ? DARK : LIGHT;
    parts.push(
      `<text x="${k * SQUARE + 92}" y="794" text-anchor="end" fill="${onLight(k + 1)}">${file}</text>`,
      `<text x="6" y="${k * SQUARE + 20}" fill="${onLight(k)}">${rank}</text>`,
    );
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="${size}" height="${size}" font-family="sans-serif" font-size="18" font-weight="bold" role="img">` +
    parts.join("") +
    "</svg>"
  );
}

/** The path of the picture on this script's host, for a card's Markdown. */
export function boardPath(base: string, picture: BoardPicture): string {
  const q = [`p=${picture.placement}`];
  if (picture.last) q.push(`l=${picture.last}`);
  if (picture.check) q.push(`c=${picture.check}`);
  if (picture.flip) q.push("f=1");
  return `${base}?${q.join("&")}`;
}

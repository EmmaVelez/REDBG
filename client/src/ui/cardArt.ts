/**
 * Card art URLs.
 *
 * The artwork lives in `game-core/src/data/CARD-ART/<UPPERCASE-ID>.svg` —
 * one file per card id, art only (no printed text). Vite globs the directory
 * at build time, so dropping a new SVG there is enough: no manifest to keep
 * in sync, and the browser only fetches the images a card actually renders.
 *
 * Cards without a file (most of the catalogue) get `undefined` and the UI
 * keeps the placeholder frame.
 */

const modules = import.meta.glob('../../../game-core/src/data/CARD-ART/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const BY_ID: Record<string, string> = {};
for (const [path, url] of Object.entries(modules)) {
  const file = path.slice(path.lastIndexOf('/') + 1).replace(/\.svg$/i, '');
  BY_ID[file.toUpperCase()] = url;
}

/** Art URL for a card id (case-insensitive), or undefined when there is no SVG. */
export function cardArtUrl(cardId: string): string | undefined {
  return BY_ID[cardId.toUpperCase()];
}

/** True when the card has art — used to switch the frame to art mode. */
export function hasCardArt(cardId: string): boolean {
  return BY_ID[cardId.toUpperCase()] !== undefined;
}

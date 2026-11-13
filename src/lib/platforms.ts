/**
 * Platform icons.
 *
 * The four PNGs were made by the client and live in `public/images/platforms`.
 * Platform names come from the editorial form, so the matching is tolerant:
 * "PS5", "PlayStation 5" or "Xbox Series X" all resolve to the same icon.
 */
const PLATFORM_IMAGES: Record<string, string> = {
  switch: '/images/platforms/switch.png',
  playstation: '/images/platforms/playstation.png',
  xbox: '/images/platforms/xbox.png',
  pc: '/images/platforms/pc.png',
};

const ALIASES: Array<[string, string]> = [
  ['switch', 'switch'],
  ['nintendo', 'switch'],
  ['playstation', 'playstation'],
  ['ps5', 'playstation'],
  ['ps4', 'playstation'],
  ['ps3', 'playstation'],
  ['xbox', 'xbox'],
  ['pc', 'pc'],
  ['windows', 'pc'],
  ['steam', 'pc'],
  ['steam deck', 'pc'],
  ['mac', 'pc'],
  ['linux', 'pc'],
];

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Icon path for a platform name, or `null` when there is no known icon. */
export function platformImage(platform: string): string | null {
  const normalized = normalize(platform);
  if (!normalized) return null;
  for (const [alias, key] of ALIASES) {
    if (normalized.includes(alias)) return PLATFORM_IMAGES[key];
  }
  return null;
}

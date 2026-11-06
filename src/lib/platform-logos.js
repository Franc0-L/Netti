/*
  Centraliza:
  - los símbolos reconocidos (switch, xbox, playstation, mobile, computer, controller).
  - los aliases tolerantes de escritura (para soportar "PS5", "PlayStation 5", "Nintendo Switch", "Xbox Series X/S", "Steam Deck", etc.).
  - las rutas de imagen PNG de cada logo.
  - el catálogo serializado para el panel administrativo
  - las rutas de imagen de plataforma (archivos en public/images/platforms/)
  @typedef {"switch" | "xbox" | "playstation" | "mobile" | "computer" | "controller"} SymbolKey
*/

// Rutas de imagen PNG de cada plataforma (archivos en public/images/platforms/).
export const PLATFORM_IMAGES = {
  switch: "/images/platforms/switch.png",
  xbox: "/images/platforms/xbox.png",
  playstation: "/images/platforms/playstation.png",
  computer: "/images/platforms/pc.png",
  mobile: "/images/platforms/pc.png",
  controller: "/images/platforms/pc.png",
};

/*
  Devuelve la ruta de imagen PNG para un símbolo de plataforma.
  @param {SymbolKey} symbol
  @returns {string}
*/
export function platformImage(symbol) {
  return PLATFORM_IMAGES[symbol] ?? PLATFORM_IMAGES.controller;
}

/*
  Catálogo canónico de plataformas. El orden define la prioridad de representación:
  consolas con logo propio primero, luego PC y móviles. Cada entrada aporta varios aliases tolerantes de escritura.
  Las entradas con `variants` se muestran como una sola opción en el picker del admin; el usuario escribe la versión exacta en el textarea (una por línea).
  @type {{ id: string; label: string; symbol: SymbolKey; aliases: string[]; tokens?: string[]; variants?: string[] }[]}
*/
export const PLATFORM_PRESETS = [
  {
    id: "switch",
    label: "Nintendo Switch",
    symbol: "switch",
    aliases: [
      "nintendo switch",
      "switch",
      "nintendo switch oled",
      "switch oled",
      "switch lite",
      "nintendo switch lite",
    ],
  },
  {
    id: "playstation",
    label: "PlayStation",
    symbol: "playstation",
    aliases: [
      "playstation 5",
      "ps5",
      "playstation 4",
      "ps4",
      "playstation 3",
      "ps3",
      "playstation 1",
      "ps1",
      "playstation one",
      "psone",
      "playstation classic",
      "playstation",
    ],
  },
  {
    id: "xbox",
    label: "Xbox",
    symbol: "xbox",
    aliases: [
      "xbox series x/s",
      "xbox series x",
      "xbox series s",
      "series x",
      "series s",
      "xbox scarlett",
      "xbox one",
      "xbox one s",
      "xbox one x",
      "xbox",
      "original xbox",
      "xbox classic",
    ],
  },
  {
    id: "pc",
    label: "PC",
    symbol: "computer",
    aliases: [
      "pc",
      "windows",
      "linux",
      "macos",
      "mac",
      "macintosh",
      "steam deck",
      "steamdeck",
      "steam",
      "computer",
    ],
  },
  { id: "android", label: "Android", symbol: "mobile", aliases: ["android"] },
  {
    id: "ios",
    label: "iOS",
    symbol: "mobile",
    aliases: ["ios", "iphone", "ipad", "ipados"],
  },
];

const ORDER = new Map(
  PLATFORM_PRESETS.map((preset, index) => [preset.id, index]),
);

/*
  Normaliza un nombre de plataforma a una forma comparable: quita diacríticos, pasa a minúsculas y colapsa los no-alfanuméricos a espacios.
  @param {string} value
*/
function normalizeName(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/*
  Tokens de búsqueda por preset. Se usan frases completas (y su forma sin espacios) en lugar de palabras sueltas, de modo que "nintendo" no etiquete
  una Nintendo 64 como Switch. Dedupeados y ordenados de más largo a más corto para preferenciar la coincidencia más específica.
*/
function compileTokens(preset) {
  const tokens = new Set();
  for (const source of [...preset.aliases, preset.label]) {
    const normalized = normalizeName(source);
    if (!normalized) continue;
    tokens.add(normalized);
    tokens.add(normalized.replace(/\s+/g, ""));
  }
  return [...tokens].sort((a, b) => b.length - a.length);
}

PLATFORM_PRESETS.forEach((preset) => {
  preset.tokens = compileTokens(preset);
});

/*
  Regla de matching usada tanto por este módulo como (de forma equivalente) por el cliente del admin a partir de los `tokens` serializados del catálogo.
  Busca el token más largo que aparezca como palabra completa.
  @param {string} value
*/
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findPreset(value) {
  const normalized = normalizeName(value);
  if (!normalized) return null;
  let best = null;
  for (const preset of PLATFORM_PRESETS) {
    for (const token of preset.tokens) {
      if (new RegExp("\\b" + escapeRegExp(token) + "\\b").test(normalized)) {
        if (!best || token.length > best.tokenLength) {
          best = { preset, tokenLength: token.length };
        }
      }
    }
  }
  return best ? best.preset : null;
}

/*
  Resuelve el símbolo de logo para un nombre de plataforma, tolerante a variantes.
  @param {string} platform
  @returns {SymbolKey}
*/
export function platformSymbol(platform) {
  return findPreset(platform)?.symbol ?? "controller";
}

/*
  Normaliza, dedupe y ordena una lista de plataformas: primero las consolas con logo (por prioridad canónica) y luego el resto alfabéticamente.
  Conserva el texto original de los valores no reconocidos.
  @param {string[]} platforms
  @returns {string[]}
*/
export function canonicalizePlatforms(platforms) {
  const seen = new Set();
  const recognized = [];
  const unknown = [];
  for (const value of platforms || []) {
    const original = String(value).trim();
    if (!original) continue;
    const preset = findPreset(original);
    const key = (preset ? preset.label : original).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (preset) recognized.push(preset);
    else unknown.push(original);
  }
  recognized.sort((a, b) => (ORDER.get(a.id) ?? 0) - (ORDER.get(b.id) ?? 0));
  return [
    ...recognized.map((preset) => preset.label),
    ...unknown.sort((a, b) => a.localeCompare(b)),
  ];
}

export default {
  PLATFORM_PRESETS,
  PLATFORM_IMAGES,
  platformSymbol,
  platformImage,
  canonicalizePlatforms,
};

/**
 * Fuente única de la identidad de plataformas de Netti.
 *
 * Centraliza:
 *  - los símbolos reconocidos (switch, xbox, playstation, mobile, computer, controller)
 *  - los aliases tolerantes de escritura (para soportar "PS5", "PlayStation 5",
 *    "Nintendo Switch", "Xbox Series X/S", "Steam Deck", etc.)
 *  - la geometría SVG de línea de cada logo (recreación geométrica, sin assets externos)
 *  - el catálogo serializado para el panel administrativo
 *  - las rutas de imagen de plataforma (archivos en public/images/platforms/)
 *
 * Este módulo es JS puro (ESM) y vive en src/lib: se importa tanto desde los
 * componentes Astro (.astro/.ts) como desde los scripts Node de scaffold.
 * El tipado proviene de JSDoc y se aplica a los consumidores TypeScript.
 *
 * @typedef {"switch" | "xbox" | "playstation" | "mobile" | "computer" | "controller"} SymbolKey
 */

/** Shape descriptors per platform symbol. Each entry carries an SVG viewBox
 *  and the inner markup (paths/rects/circles/lines) so the logo renders
 *  identically in the Astro component and the admin interface. */
export const PLATFORM_SYMBOLS = {
	"switch": {
		viewBox: "0 0 24 24",
		markup:
			'<rect x="3.2" y="7.2" width="6.8" height="9.6" rx="2"/>' +
			'<rect x="14" y="7.2" width="6.8" height="9.6" rx="2"/>' +
			'<circle cx="6.6" cy="10.4" r="1"/>' +
			'<circle cx="17.4" cy="10.4" r="1"/>' +
			'<path d="M5.2 15.6h2.2M6.3 14.4v2.4"/>' +
			'<circle cx="18.6" cy="14.6" r="1"/>',
	},
	xbox: {
		viewBox: "0 0 24 24",
		markup:
			'<circle cx="12" cy="12" r="9.2"/>' +
			'<line x1="7.4" y1="7.4" x2="16.6" y2="16.6"/>' +
			'<line x1="16.6" y1="7.4" x2="7.4" y2="16.6"/>',
	},
	playstation: {
		viewBox: "0 0 24 24",
		markup:
			'<path d="M6 4V20M6 4H12a4 4 0 0 1 0 8H6"/>' +
			'<path d="M13.5 6.5h4.5a2.5 2.5 0 0 1 2.5 2.5v1.2a2.5 2.5 0 0 1-2.5 2.5h-4.5m0 2.3h4a2.5 2.5 0 0 1 2.5 2.5v1.2a2.5 2.5 0 0 1-2.5 2.5h-4.5"/>',
	},
	mobile: {
		viewBox: "0 0 24 24",
		markup:
			'<rect x="6.5" y="2.5" width="11" height="19" rx="2"/><path d="M10 5h4M11 18.5h2"/>',
	},
	computer: {
		viewBox: "0 0 24 24",
		markup:
			'<rect x="3" y="3.5" width="18" height="13" rx="1.5"/><path d="M8 21h8M12 16.5V21"/>',
	},
	controller: {
		viewBox: "0 0 24 24",
		markup:
			'<path d="M7.5 7h9a5.5 5.5 0 0 1 5.4 6.6l-.8 3.8a2.6 2.6 0 0 1-4.5.6l-1.1-2h-7l-1.1 2a2.6 2.6 0 0 1-4.5-.6l-.8-3.8A5.5 5.5 0 0 1 7.5 7Z"/>' +
			'<path d="M8 10.5v4M6 12.5h4M16.5 11.5h.01M18.5 13.5h.01"/>',
	},
};

/** Rutas de imagen de plataforma (archivos en public/images/platforms/). */
export const PLATFORM_IMAGES = {
	"switch": "/images/platforms/switch.jpg",
	xbox: "/images/platforms/xbox.jpg",
	playstation: "/images/platforms/playstation.jpg",
	computer: "/images/platforms/pc.jpg",
	mobile: "/images/platforms/pc.jpg",
	controller: "/images/platforms/pc.jpg",
};

/**
 * Devuelve la ruta de imagen para un símbolo de plataforma.
 * @param {SymbolKey} symbol
 * @returns {string}
 */
export function platformImage(symbol) {
	return PLATFORM_IMAGES[symbol] ?? PLATFORM_IMAGES.controller;
}

/**
 * Catálogo canónico de plataformas. El orden define la prioridad de representación:
 * consolas con logo propio primero, luego PC y móviles. Cada entrada aporta varios
 * aliases tolerantes de escritura.
 * Las entradas con `variants` se muestran como una sola opción en el picker del admin;
 * el usuario escribe la versión exacta en el textarea (una por línea).
 * @type {{ id: string; label: string; symbol: SymbolKey; aliases: string[]; tokens?: string[]; variants?: string[] }[]}
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
		variants: ["PS5", "PS4", "PS3", "PS1"],
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
		variants: [
			"Series X/S",
			"Series X",
			"Series S",
			"One",
			"One S",
			"One X",
			"Classic",
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

/**
 * Normaliza un nombre de plataforma a una forma comparable: quita diacríticos,
 * pasa a minúsculas y colapsa los no-alfanuméricos a espacios.
 * @param {string} value
 */
function normalizeName(value) {
	return String(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

/**
 * Tokens de búsqueda por preset. Se usan frases completas (y su forma sin
 * espacios) en lugar de palabras sueltas, de modo que "nintendo" no etiquete
 * una Nintendo 64 como Switch. Dedupeados y ordenados de más largo a más corto
 * para preferenciar la coincidencia más específica.
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

/**
 * Regla de matching usada tanto por este módulo como (de forma equivalente)
 * por el cliente del admin a partir de los `tokens` serializados del catálogo.
 * Busca el token más largo que aparezca como palabra completa.
 * @param {string} value
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

/**
 * Resuelve el símbolo de logo para un nombre de plataforma, tolerante a variantes.
 * @param {string} platform
 * @returns {SymbolKey}
 */
export function platformSymbol(platform) {
	return findPreset(platform)?.symbol ?? "controller";
}

/**
 * Normaliza, dedupe y ordena una lista de plataformas: primero las consolas con
 * logo (por prioridad canónica) y luego el resto alfabéticamente. Conserva el
 * texto original de los valores no reconocidos.
 * @param {string[]} platforms
 * @returns {string[]}
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

/**
 * Devuelve el markup SVG completo (elemento `<svg>`) para un símbolo. Es seguro
 * inyectarlo como HTML porque no contiene datos del usuario.
 * @param {SymbolKey} symbol
 * @param {object} [options]
 * @param {string} [options.className]
 * @returns {string}
 */
export function iconSvg(symbol, options = {}) {
	const entry = PLATFORM_SYMBOLS[symbol] ?? PLATFORM_SYMBOLS.controller;
	const classAttr = options.className ? ` class="${options.className}"` : "";
	return (
		`<svg viewBox="${entry.viewBox}"${classAttr} aria-hidden="true" focusable="false"` +
		' fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
		`${entry.markup}</svg>`
	);
}

/**
 * Serializa el catálogo para el cliente del panel administrativo. Los `tokens`
 * permiten al cliente resolver el símbolo de valores arbitrarios sin replicar
 * la tabla de aliases.
 * @returns {{ presets: Array<{ id: string; label: string; symbol: SymbolKey; tokens: string[] }>; icons: Record<string, { viewBox: string; markup: string }> }}
 */
export function catalogForAdmin() {
	const presets = PLATFORM_PRESETS.map((preset) => ({
		id: preset.id,
		label: preset.label,
		symbol: preset.symbol,
		tokens: preset.tokens,
		variants: preset.variants,
	}));
	const icons = Object.fromEntries(
		Object.keys(PLATFORM_SYMBOLS).map((symbol) => [
			symbol,
			PLATFORM_SYMBOLS[symbol],
		]),
	);
	return { presets, icons };
}

export default {
	PLATFORM_PRESETS,
	PLATFORM_SYMBOLS,
	PLATFORM_IMAGES,
	platformSymbol,
	platformImage,
	canonicalizePlatforms,
	iconSvg,
	catalogForAdmin,
};

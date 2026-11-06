import { defaultSchema } from "rehype-sanitize";

/*
  Esquema único de sanitización del HTML editorial.
  Se comparte entre el procesador de Markdown de Astro (archivos .md) y el
  renderizado en tiempo de request (`renderMarkdown`), para que ambos caminos
  permitan exactamente el mismo subconjunto de HTML.
*/
export const markdownSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a ?? []), "target", "rel"],
    img: [
      ...(defaultSchema.attributes?.img ?? []),
      "loading",
      "decoding",
      "width",
      "height",
    ],
    video: [
      "controls",
      "preload",
      "muted",
      "poster",
      "ariaLabel",
      "width",
      "height",
    ],
    audio: ["controls", "preload", "muted", "ariaLabel"],
    source: ["src", "type"],
  },
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "details",
    "summary",
    "figure",
    "figcaption",
    "video",
    "audio",
    "source",
  ],
};

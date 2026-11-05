import { defineConfig } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import sitemap from "@astrojs/sitemap";
import vercel from "@astrojs/vercel";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

const site = process.env.PUBLIC_SITE_URL;

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

export default defineConfig({
  output: "server",
  adapter: vercel(),
  site: site || undefined,
  integrations: site ? [sitemap()] : [],
  markdown: {
    processor: unified({
      rehypePlugins: [[rehypeRaw], [rehypeSanitize, markdownSanitizeSchema]],
    }),
  },
});

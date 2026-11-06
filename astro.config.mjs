import { defineConfig } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import sitemap from "@astrojs/sitemap";
import vercel from "@astrojs/vercel";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { markdownSanitizeSchema } from "./src/lib/markdown-schema.ts";

const site = process.env.PUBLIC_SITE_URL;

export { markdownSanitizeSchema };

export default defineConfig({
  output: "server",
  adapter: vercel(),
  site: site || undefined,
  integrations: site ? [sitemap()] : [],
  // Astro inlinea los scripts pequeños por defecto. La CSP del sitio solo
  // permite scripts externos del propio origen (`script-src 'self'`), así que
  // forzamos a que todos los scripts se emitan como archivos en `_astro/`.
  vite: {
    build: {
      assetsInlineLimit: 0,
    },
  },
  markdown: {
    processor: unified({
      rehypePlugins: [[rehypeRaw], [rehypeSanitize, markdownSanitizeSchema]],
    }),
  },
});

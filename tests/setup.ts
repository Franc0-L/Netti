import { createServer } from "vite";
import { createAstro } from "astro";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export let astroServer: ReturnType<typeof createAstro> | null = null;
export let viteServer: ReturnType<typeof createServer> | null = null;

export async function setupServer() {
  viteServer = await createServer({
    configFile: path.resolve(__dirname, "../astro.config.mjs"),
    server: { middlewareMode: true },
  });

  astroServer = createAstro(viteServer);
  await astroServer.start();
}

export async function teardownServer() {
  if (astroServer) {
    await astroServer.stop();
    astroServer = null;
  }
  if (viteServer) {
    await viteServer.close();
    viteServer = null;
  }
}

export async function fetchPage(pagePath: string): Promise<string> {
  if (!astroServer) throw new Error("Astro server not started");
  const response = await astroServer.request({
    url: `http://localhost${pagePath}`,
    method: "GET",
  } as Request);
  return response.text();
}

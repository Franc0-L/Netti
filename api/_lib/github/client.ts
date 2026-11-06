/*
  Cliente de GitHub para las serverless functions del panel.
  Reexporta el cliente único del sitio (`githubFetch`) para no mantener dos
  implementaciones con el mismo comportamiento de auth, reintentos y errores.
*/
export {
  githubFetch as githubClient,
  GitHubHttpError,
} from "../../../src/lib/github-fetch.js";
export type { GitHubFetchOptions as GitHubClientOptions } from "../../../src/lib/github-fetch.js";

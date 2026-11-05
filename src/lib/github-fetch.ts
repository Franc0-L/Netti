import { serverEnv } from "./env";

const REPO = serverEnv("CONTENT_GITHUB_REPO") || "Franc0-L/Contenido-Netti";

export interface GitHubFetchOptions {
  method?: string;
  headers?: HeadersInit;
  body?: unknown;
  retries?: number;
}

/*
    Error HTTP de la API de Github con el código de estado expuesto. Permite distinguir un error 404
    de un fallo real sin depender del texto del mensaje.
*/
export class GitHubHttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GitHubHttpError";
    this.status = status;
  }
}

/*
    Cliente único de la API de Github para todo el sitio Netti. Lee CONTENT_GITHUB_REPO
    y CONTENT_GITHUB_TOKEN vía serverEnv, que funciona tanto en Astro SSR/dev como en serverless functions de Vercel.
    @param path  Ruta de la API
    @param options  method, headers, body (objeto, se serializa a JSON) y retries opcional
*/
export async function githubFetch(
  path: string,
  options: GitHubFetchOptions = {},
): Promise<any> {
  const { method, headers = {}, body, retries = 0 } = options;
  const token = serverEnv("CONTENT_GITHUB_TOKEN")?.trim();

  const finalHeaders: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Netti",
    ...(headers as Record<string, string>),
  };

  if (token) {
    finalHeaders["Authorization"] = `Bearer ${token}`;
  }

  if (body !== undefined) {
    finalHeaders["Content-Type"] = "application/json";
  }

  const url = `https://api.github.com/repos/${REPO}${path}`;

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method,
        headers: finalHeaders,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });

      const retryAfter = response.headers?.get?.("Retry-After") ?? null;
      const rateLimited =
        response.status === 429 ||
        (response.status === 403 &&
          (retryAfter !== null ||
            response.headers?.get?.("x-ratelimit-remaining") === "0"));

      if (rateLimited) {
        if (attempt < retries) {
          // Rate limit: esperar y reintentar
          const delay = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : Math.min(1000 * 2 ** attempt, 8000);
          await new Promise((resolve) => setTimeout(resolve, delay));
          lastError = new GitHubHttpError(
            `GitHub API ${response.status} (rate limit), reintento ${attempt + 1}`,
            response.status,
          );
          continue;
        }
        throw new GitHubHttpError(
          "GitHub limitó la cantidad de solicitudes. Intentá más tarde.",
          response.status,
        );
      }

      if (!response.ok) {
        if (response.status === 409 || response.status === 422) {
          throw new GitHubHttpError(
            "El archivo cambió en GitHub o el slug ya existe. Recargá el listado e intentá de nuevo.",
            response.status,
          );
        }
        if (response.status === 401 || response.status === 403) {
          throw new GitHubHttpError(
            "GitHub rechazó el token editorial. Revisá sus permisos.",
            response.status,
          );
        }
        throw new GitHubHttpError(
          `GitHub respondió ${response.status}.`,
          response.status,
        );
      }

      return response.json();
    } catch (error) {
      lastError = error;
      // Los errores 4xx no se reintentan: reintentar un 404, 401 o 409 solo agrega latencia sin posibilidad de éxito.
      if (error instanceof GitHubHttpError && error.status < 500) {
        throw error;
      }
      if (attempt < retries) {
        const delay = Math.min(1000 * 2 ** attempt, 8000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

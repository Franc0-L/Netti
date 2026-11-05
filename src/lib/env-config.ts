const REQUIRED: Record<string, string> = {
  CONTENT_GITHUB_TOKEN:
    "Token de GitHub para acceder al repositorio de contenido (Contenido-Netti).",
  CONTENT_GITHUB_REPO:
    "Nombre del repositorio de contenido (formato owner/repo).",
  ADMIN_PASSWORD: "Contraseña de acceso al panel editorial.",
  ADMIN_SESSION_SECRET: "Secreto para firmar las cookies de sesión del panel.",
};

const OPTIONAL: Record<string, string> = {
  PUBLIC_SITE_URL: "URL pública del sitio (usada para el sitemap).",
  ADMIN_LOGIN_GLOBAL_MAX: "Límite global de intentos de login (número).",
};

function readFromEnv(name: string): string | undefined {
  if (typeof process !== "undefined" && process.env?.[name]) {
    return process.env[name].trim();
  }
  try {
    const fromVite = (
      import.meta as {
        env?: Record<string, unknown>;
      }
    ).env?.[name];
    if (typeof fromVite === "string") return fromVite.trim();
  } catch {
    // import.meta.env no existe en todos los runtimes.
  }
  return undefined;
}

// Obtiene una variable de entorno requerida por nombre. Lanza Error si no está definida.
export function getRequiredEnv(name: string): string {
  const value = readFromEnv(name);
  if (!value) {
    const description = REQUIRED[name];
    throw new Error(
      `Variable de entorno requerida faltante: ${name}. ${description ?? ""}`,
    );
  }
  return value;
}

// Obtiene una variable de entorno opcional por nombre. Devuelve undefined si no está definida.
export function getOptionalEnv(name: string): string | undefined {
  return readFromEnv(name);
}

// Valida que todas las variables REQUIRED estén definidas. Lanza Error con la lista de faltantes si alguna falta.
export function validateRequiredEnv(): void {
  const missing: string[] = [];
  for (const [name, description] of Object.entries(REQUIRED)) {
    if (!readFromEnv(name)) {
      missing.push(`${name}: ${description}`);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Variables de entorno requeridas faltantes:\n${missing.join("\n")}`,
    );
  }
}

// Devuelve un objeto con todas las variables REQUIRED. Lanza Error si alguna falta.
export function getAllRequiredEnv(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of Object.keys(REQUIRED)) {
    result[name] = getRequiredEnv(name);
  }
  return result;
}

// Devuelve un objeto con todas las variables OPTIONAL. Las no definidas serán undefined.
export function getAllOptionalEnv(): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const name of Object.keys(OPTIONAL)) {
    result[name] = getOptionalEnv(name);
  }
  return result;
}

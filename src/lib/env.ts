// Compatibilidad con el lector histórico de variables de entorno.
import { getOptionalEnv } from "./env-config";

// Lee una variable de entorno del servidor.
export function serverEnv(name: string): string | undefined {
  return getOptionalEnv(name);
}

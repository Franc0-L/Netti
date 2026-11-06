#!/usr/bin/env node
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";

const IMAGE_EXTENSION = /\.(?:avif|gif|jpe?g|png|webp)$/i;
const MEDIA_REFERENCE = /(?:^|[\s"'(=])\/?media\/([A-Za-z0-9._/-]+\.(?:avif|gif|jpe?g|png|webp))/gi;

export interface MediaAuditResult {
  totalMedia: number;
  referencedMedia: number;
  orphaned: Array<{ path: string; usedBy: string[] }>;
}

function walkFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) return [];
    if (entry.isDirectory()) return walkFiles(path);
    return entry.isFile() ? [path] : [];
  });
}

/**
 * Audits media references without modifying or deleting repository files.
 * Markdown inside .deleted is intentionally included so trash entries retain
 * their media while they remain recoverable.
 */
export function auditMedia(contentRepositoryPath: string): MediaAuditResult {
  const root = resolve(contentRepositoryPath);
  const contentDirectory = join(root, "content");
  const mediaDirectory = join(root, "media");

  if (!existsSync(contentDirectory) || !statSync(contentDirectory).isDirectory()) {
    throw new Error(`No se encontró la carpeta content/ en: ${root}`);
  }

  const references = new Map<string, Set<string>>();
  const markdownFiles = walkFiles(contentDirectory).filter((file) =>
    [".md", ".mdx"].includes(extname(file).toLowerCase()),
  );

  for (const file of markdownFiles) {
    const source = readFileSync(file, "utf8");
    const relativeContentPath = relative(root, file).split(sep).join("/");
    MEDIA_REFERENCE.lastIndex = 0;

    for (const match of source.matchAll(MEDIA_REFERENCE)) {
      const mediaPath = `media/${match[1]}`.replace(/\\/g, "/");
      const segments = mediaPath.split("/");
      if (segments.some((segment) => segment === "." || segment === "..")) {
        continue;
      }
      const users = references.get(mediaPath) ?? new Set<string>();
      users.add(relativeContentPath);
      references.set(mediaPath, users);
    }
  }

  const mediaFiles = walkFiles(mediaDirectory).filter((file) =>
    IMAGE_EXTENSION.test(file),
  );

  const orphaned = mediaFiles
    .map((file) => {
      const path = relative(root, file).split(sep).join("/");
      return {
        path,
        usedBy: [...(references.get(path) ?? [])].sort(),
      };
    })
    .filter((entry) => entry.usedBy.length === 0)
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    totalMedia: mediaFiles.length,
    referencedMedia: mediaFiles.length - orphaned.length,
    orphaned,
  };
}

function main(): void {
  const repositoryPath = process.argv[2];
  if (!repositoryPath) {
    console.error(
      "Uso: npx tsx scripts/media-audit.ts <ruta-al-repo-Contenido-Netti>",
    );
    process.exitCode = 1;
    return;
  }

  try {
    const result = auditMedia(repositoryPath);
    console.log("\n=== Netti — Auditoría de medios ===\n");
    console.log(`Imágenes encontradas: ${result.totalMedia}`);
    console.log(`Con referencias: ${result.referencedMedia}`);
    console.log(`Sin referencias detectadas: ${result.orphaned.length}`);

    if (result.orphaned.length) {
      console.log("\nArchivos que conviene revisar (no se borran automáticamente):");
      for (const entry of result.orphaned) console.log(`- ${entry.path}`);
    } else {
      console.log("\nNo se detectaron imágenes sin referencias.");
    }

    console.log(
      "\nNota: también se consideran las publicaciones de content/**/.deleted para no marcar como huérfanas imágenes de artículos recuperables.",
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "No se pudo auditar la carpeta de medios.",
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  main();
}

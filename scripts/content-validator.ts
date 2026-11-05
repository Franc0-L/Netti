#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  editorialSchemas,
  requiredFields,
  textLimits,
  imageAltRequired,
  type EditorialCollection,
} from "../src/lib/editorial-contract";

interface ValidationResult {
  file: string;
  collection: string;
  slug: string;
  valid: boolean;
  errors: string[];
}

function findCollection(slugPath: string): EditorialCollection | null {
  const match = slugPath.match(/^content\/(games|reviews|news|guides)\//);
  return match ? (match[1] as EditorialCollection) : null;
}

function parseMarkdownFile(filePath: string): {
  fields: Record<string, unknown>;
  body: string;
} | null {
  const content = readFileSync(filePath, "utf8");
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return null;

  try {
    const fields = (parseYaml(match[1]) || {}) as Record<string, unknown>;
    const body = content.slice(match[0].length).trimStart();
    return { fields, body };
  } catch {
    return null;
  }
}

function validateEntry(
  collection: EditorialCollection,
  fields: Record<string, unknown>,
  body: string,
  fileName: string,
): string[] {
  const errors: string[] = [];
  const schema = editorialSchemas[collection];

  // Validar campos requeridos
  const keys = requiredFields[collection];
  for (const key of keys) {
    const value = fields[key];
    if (value === undefined || value === null || value === "") {
      errors.push(`  - Campo requerido faltante: "${key}"`);
    }
  }

  // Validar límites de texto
  for (const [key, [min, max]] of Object.entries(textLimits)) {
    const value = fields[key];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string") {
      errors.push(`  - "${key}" debe ser texto`);
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length < min || trimmed.length > max) {
      errors.push(
        `  - "${key}" debe tener entre ${min} y ${max} caracteres (actual: ${trimmed.length})`,
      );
    }
  }

  // Validar que imágenes requieran alt
  for (const [imageField, altFields] of Object.entries(imageAltRequired)) {
    if (!fields[imageField]) continue;
    for (const altField of altFields) {
      if (typeof fields[altField] !== "string" || !fields[altField].trim()) {
        errors.push(
          `  - "${imageField}" requiere "${altField}" (texto alternativo obligatorio)`,
        );
      }
    }
  }

  // Validar con schema Zod completo
  const result = schema.safeParse(fields);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path.join(".");
      errors.push(`  - Schema Zod: ${path} — ${issue.message}`);
    }
  }

  // Validar que el cuerpo no esté vacío
  if (!body || !body.trim()) {
    errors.push(`  - Cuerpo del artículo vacío`);
  }

  return errors;
}

function walkDir(dir: string): string[] {
  let results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walkDir(fullPath));
    } else if (extname(entry.name) === ".md") {
      results.push(fullPath);
    }
  }
  return results;
}

function main() {
  const args = process.argv.slice(2);
  const contentRepoPath = args[0];

  if (!contentRepoPath) {
    console.error(
      "Uso: npx tsx scripts/content-validator.ts <ruta-al-repo-Contenido-Netti>",
    );
    process.exit(1);
  }

  const contentDir = join(contentRepoPath, "content");
  try {
    statSync(contentDir);
  } catch {
    console.error(
      `No se encontró la carpeta "content/" en: ${contentRepoPath}`,
    );
    process.exit(1);
  }

  const mdFiles = walkDir(contentDir);
  const results: ValidationResult[] = [];

  for (const filePath of mdFiles) {
    const relativePath = filePath
      .replace(contentRepoPath, "")
      .replace(/^\//, "");
    const collection = findCollection(relativePath);
    if (!collection) continue;

    const slug = basename(filePath, ".md");
    const parsed = parseMarkdownFile(filePath);

    if (!parsed) {
      results.push({
        file: relativePath,
        collection,
        slug,
        valid: false,
        errors: [`  - No se pudo parsear el frontmatter YAML`],
      });
      continue;
    }

    const errors = validateEntry(
      collection,
      parsed.fields,
      parsed.body,
      basename(filePath),
    );
    results.push({
      file: relativePath,
      collection,
      slug,
      valid: errors.length === 0,
      errors,
    });
  }

  // Reporte
  const invalid = results.filter((r) => !r.valid);
  const valid = results.filter((r) => r.valid);

  console.log("\n=== Content Validator — Reporte ===\n");
  console.log(`Archivos analizados: ${results.length}`);
  console.log(`Válidos: ${valid.length}`);
  console.log(`Con errores: ${invalid.length}\n`);

  if (invalid.length > 0) {
    console.log("Archivos con errores:\n");
    for (const result of invalid) {
      console.log(`📄 ${result.file} (${result.collection}/${result.slug})`);
      for (const error of result.errors) {
        console.log(error);
      }
      console.log("");
    }
    process.exit(1);
  } else {
    console.log("✅ Todos los archivos son válidos.\n");
    process.exit(0);
  }
}

main();

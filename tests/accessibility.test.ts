import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { basename, extname, join } from "node:path";

const PAGES_DIR = join(process.cwd(), "src", "pages");

function walkDir(dir: string): string[] {
  let results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walkDir(fullPath));
    } else if (extname(entry.name) === ".astro") {
      results.push(fullPath);
    }
  }
  return results;
}

function checkAccessibility(html: string, fileName: string): string[] {
  const errors: string[] = [];

  // Cada página debe usar BaseLayout (que provee lang="es", skip-link, etc.)
  if (!/<BaseLayout/i.test(html)) {
    errors.push(`${fileName}: no usa <BaseLayout>`);
  }

  // Imágenes sin alt
  const imgMatches = html.matchAll(/<img[^>]*>/gi);
  for (const match of imgMatches) {
    const imgTag = match[0];
    if (!/alt\s*=/i.test(imgTag)) {
      const srcMatch = imgTag.match(/src\s*=\s*["']([^"']+)["']/i);
      const src = srcMatch ? srcMatch[1] : "desconocida";
      errors.push(`${fileName}: imagen sin alt: ${src}`);
    }
  }

  // Inputs sin label ni aria-label
  const inputMatches = html.matchAll(/<input[^>]*>/gi);
  for (const match of inputMatches) {
    const inputTag = match[0];

    if (/aria-label\s*=/i.test(inputTag)) continue;

    const idMatch = inputTag.match(/id\s*=\s*["']([^"']+)["']/i);
    if (idMatch) {
      const inputId = idMatch[1];
      const labelRegex = new RegExp(
        `<label[^>]*for\\s*=["']${inputId}["'][^>]*>`,
        "i",
      );
      const wrappedLabelRegex = /<label[^>]*>[\s\S]*<input[\s\S]*<\/label>/i;
      if (!labelRegex.test(html) && !wrappedLabelRegex.test(html)) {
        errors.push(
          `${fileName}: input sin label ni aria-label (id="${inputId}")`,
        );
      }
    } else if (!/aria-label/i.test(inputTag)) {
      errors.push(`${fileName}: input sin id, label ni aria-label`);
    }
  }

  return errors;
}

describe("Accesibilidad (páginas)", () => {
  it("todos los archivos .astro en src/pages/ deben usar BaseLayout y tener elementos accesibles", () => {
    const astroFiles = walkDir(PAGES_DIR);
    const allErrors: string[] = [];

    for (const filePath of astroFiles) {
      const content = readFileSync(filePath, "utf8");
      const fileName = basename(filePath);
      const errors = checkAccessibility(content, fileName);
      allErrors.push(...errors);
    }

    if (allErrors.length > 0) {
      console.log("Errores de accesibilidad encontrados:");
      for (const error of allErrors) {
        console.log(`  - ${error}`);
      }
    }

    expect(allErrors).toEqual([]);
  });
});

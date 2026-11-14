import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Environment loader for the local scripts.
 *
 * The scripts read the `.env` file of the repository so a clean clone can run
 * `npm run test:db` without exporting variables by hand. Two rules apply:
 *
 * - a variable that already exists in the environment wins: the shell or the
 *   CI always has priority over the file;
 * - the file list is explicit: the test scripts never load `.env.local`,
 *   which points to the production database.
 */
export function loadEnvFiles(files: string[], root: string = process.cwd()): void {
  for (const file of files) {
    let contents: string;
    try {
      contents = readFileSync(resolve(root, file), 'utf8');
    } catch {
      continue;
    }

    for (const line of contents.split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const key = match[1];
      if (process.env[key] !== undefined) continue;
      process.env[key] = parseEnvValue(match[2] ?? '');
    }
  }
}

/** Removes the quotes of a value and drops a trailing inline comment. */
function parseEnvValue(raw: string): string {
  const value = raw.trim();
  const quoted = /^(['"])([\s\S]*)\1$/.exec(value);
  if (quoted) return quoted[2];
  const comment = value.indexOf(' #');
  return (comment >= 0 ? value.slice(0, comment) : value).trim();
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Fails fast when the target database is not local.
 *
 * The test scripts create and drop databases and the smoke test purges
 * sessions globally, so they must never run against a remote instance.
 */
export function assertLocalDatabaseUrl(raw: string | undefined, label = 'DATABASE_URL'): URL {
  if (!raw) throw new Error(`${label} is required for the local checks.`);
  const url = new URL(raw);
  if (!LOCAL_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error(
      `Refusing to run against a non-local host: ${url.hostname}. ` +
        'The local checks only accept localhost, 127.0.0.1 or ::1.'
    );
  }
  return url;
}

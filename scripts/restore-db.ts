import { spawn, spawnSync } from "node:child_process";
import { stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

type DatabaseConnection = {
  host: string;
  port: string;
  username: string;
  database: string;
  password?: string;
  sslmode?: string;
};

function parseDatabaseUrl(value: string | undefined): DatabaseConnection {
  if (!value) throw new Error("NETTI_RESTORE_DATABASE_URL no está definida. No se usará DATABASE_URL ni DATABASE_URL_UNPOOLED.");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("NETTI_RESTORE_DATABASE_URL no contiene una URL PostgreSQL válida.");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("NETTI_RESTORE_DATABASE_URL debe usar el protocolo postgres o postgresql.");
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  if (!url.hostname || !database || !username) {
    throw new Error("NETTI_RESTORE_DATABASE_URL debe incluir host, base de datos y usuario.");
  }

  const sslmode = url.searchParams.get("sslmode") ?? undefined;
  if (sslmode && !["disable", "allow", "prefer", "require", "verify-ca", "verify-full"].includes(sslmode)) {
    throw new Error("NETTI_RESTORE_DATABASE_URL contiene un sslmode no reconocido por libpq.");
  }

  return {
    host: url.hostname,
    port: url.port || "5432",
    username,
    database,
    ...(password ? { password } : {}),
    ...(sslmode ? { sslmode } : {}),
  };
}

function assertSafeLocalTestTarget(connection: DatabaseConnection): void {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (!localHosts.has(connection.host.toLowerCase())) {
    throw new Error("Restauración cancelada: el destino debe ser localhost, 127.0.0.1 o ::1.");
  }
  if (!/(?:^|[_-])test(?:ing)?$/i.test(connection.database)) {
    throw new Error("Restauración cancelada: el nombre de la base debe terminar en _test, -test, _testing o -testing.");
  }
}

function assertPostgres18Client(): void {
  const result = spawnSync("pg_restore", ["--version"], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error("No se pudo ejecutar pg_restore. Instalá el cliente PostgreSQL 18 y agregalo al PATH.");
  }

  const major = Number(result.stdout.match(/\b(\d+)\./)?.[1]);
  if (!Number.isInteger(major) || major < 18) {
    throw new Error(`Se requiere pg_restore 18 o posterior; versión detectada: ${result.stdout.trim() || "desconocida"}.`);
  }
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv, inheritOutput = true): Promise<void> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: inheritOutput ? "inherit" : ["ignore", "ignore", "inherit"],
      shell: false,
    });
    child.once("error", () => reject(new Error(`No se pudo iniciar ${command}. Verificá que PostgreSQL 18 esté instalado y en PATH.`)));
    child.once("close", (code) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} terminó con código ${code ?? "desconocido"}.`));
    });
  });
}

async function main(): Promise<void> {
  process.umask(0o077);
  assertPostgres18Client();

  const [dumpArgument, ...extraArguments] = process.argv.slice(2);
  if (!dumpArgument || extraArguments.length > 0) {
    throw new Error("Uso: npm run db:restore -- <ruta-al-archivo.dump>");
  }

  const dumpFile = isAbsolute(dumpArgument) ? dumpArgument : resolve(process.cwd(), dumpArgument);
  const dumpStats = await stat(dumpFile).catch(() => null);
  if (!dumpStats?.isFile() || dumpStats.size === 0) {
    throw new Error("El archivo indicado no existe, no es un archivo regular o está vacío.");
  }

  // Validate the archive before connecting to or modifying the target database.
  await run("pg_restore", ["--list", dumpFile], process.env, false);
  console.log("Archivo custom válido: pg_restore --list terminó correctamente.");

  const connection = parseDatabaseUrl(process.env.NETTI_RESTORE_DATABASE_URL);
  assertSafeLocalTestTarget(connection);

  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  delete childEnv.NETTI_RESTORE_DATABASE_URL;
  delete childEnv.DATABASE_URL;
  delete childEnv.DATABASE_URL_UNPOOLED;
  delete childEnv.PGPASSWORD;
  if (connection.password) childEnv.PGPASSWORD = connection.password;
  if (connection.sslmode) childEnv.PGSSLMODE = connection.sslmode;

  const args = [
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-acl",
    "--exit-on-error",
    "--single-transaction",
    "--no-password",
    "--host", connection.host,
    "--port", connection.port,
    "--username", connection.username,
    "--dbname", connection.database,
    dumpFile,
  ];

  try {
    await run("pg_restore", args, childEnv);
    console.log(`Restauración completada en la base local de prueba "${connection.database}".`);
  } finally {
    delete childEnv.PGPASSWORD;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Falló la restauración.");
  process.exitCode = 1;
});

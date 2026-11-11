import { loadEnvConfig } from '@next/env';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

type DatabaseConnection = {
  host: string;
  port: string;
  username: string;
  database: string;
  password?: string;
  sslmode?: string;
};

function parseDatabaseUrl(value: string | undefined, variable: string): DatabaseConnection {
  if (!value) throw new Error(`${variable} no está definida.`);

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variable} no contiene una URL PostgreSQL válida.`);
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error(`${variable} debe usar el protocolo postgres o postgresql.`);
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  if (!url.hostname || !database || !username) {
    throw new Error(`${variable} debe incluir host, base de datos y usuario.`);
  }

  const sslmode = url.searchParams.get('sslmode') ?? undefined;
  if (
    sslmode &&
    !['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'].includes(sslmode)
  ) {
    throw new Error(`${variable} contiene un sslmode no reconocido por libpq.`);
  }

  return {
    host: url.hostname,
    port: url.port || '5432',
    username,
    database,
    ...(password ? { password } : {}),
    ...(sslmode ? { sslmode } : {}),
  };
}

function assertPostgres18Client(): void {
  const result = spawnSync('pg_dump', ['--version'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(
      'No se pudo ejecutar pg_dump. Instalá el cliente PostgreSQL 18 y agregalo al PATH.'
    );
  }

  const major = Number(result.stdout.match(/\b(\d+)\./)?.[1]);
  if (!Number.isInteger(major) || major < 18) {
    throw new Error(
      `Se requiere pg_dump 18 o posterior; versión detectada: ${result.stdout.trim() || 'desconocida'}.`
    );
  }
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: 'inherit',
      shell: false,
    });
    child.once('error', () =>
      reject(
        new Error(
          `No se pudo iniciar ${command}. Verificá que PostgreSQL 18 esté instalado y en PATH.`
        )
      )
    );
    child.once('close', (code) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} terminó con código ${code ?? 'desconocido'}.`));
    });
  });
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  process.umask(0o077);
  assertPostgres18Client();

  const connection = parseDatabaseUrl(process.env.DATABASE_URL_UNPOOLED, 'DATABASE_URL_UNPOOLED');
  const outputDirectory = resolve(process.cwd(), 'backups');
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputFile = resolve(outputDirectory, `netti-${timestamp}.dump`);

  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  delete childEnv.DATABASE_URL;
  delete childEnv.DATABASE_URL_UNPOOLED;
  delete childEnv.PGPASSWORD;
  if (connection.password) childEnv.PGPASSWORD = connection.password;
  if (connection.sslmode) childEnv.PGSSLMODE = connection.sslmode;

  const args = [
    '--format=custom',
    '--no-owner',
    '--no-acl',
    '--no-password',
    '--host',
    connection.host,
    '--port',
    connection.port,
    '--username',
    connection.username,
    '--dbname',
    connection.database,
    '--exclude-table-data=sessions',
    '--exclude-table-data=login_attempts',
    '--file',
    outputFile,
  ];

  try {
    await run('pg_dump', args, childEnv);
    console.log(`Backup creado: ${outputFile}`);
    console.log('Verificá el archivo con: pg_restore --list "<archivo.dump>"');
  } catch (error) {
    await rm(outputFile, { force: true });
    throw error;
  } finally {
    delete childEnv.PGPASSWORD;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Falló el backup.');
  process.exitCode = 1;
});

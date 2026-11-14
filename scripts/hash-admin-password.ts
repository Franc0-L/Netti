import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import * as readline from 'node:readline';

function deriveScrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      64,
      { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
      (error, derived) => {
        if (error) reject(error);
        else resolve(derived as Buffer);
      }
    );
  });
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  const password = await new Promise<string>((resolve) => {
    rl.question('Ingresá la contraseña de administrador (mínimo 12 caracteres): ', (answer) => {
      rl.close();
      resolve(answer);
    });
  });

  if (password.length < 12) {
    throw new Error('La contraseña debe tener al menos 12 caracteres.');
  }

  const salt = randomBytes(16);
  const derived = await deriveScrypt(password, salt);
  process.stdout.write(
    '\nscrypt:131072:8:1:' + salt.toString('base64') + ':' + derived.toString('base64') + '\n'
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

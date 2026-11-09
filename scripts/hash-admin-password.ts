import { randomBytes, scrypt as scryptCallback } from "node:crypto";
function deriveScrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (error, derived) => {
      if (error) reject(error);
      else resolve(derived as Buffer);
    });
  });
}
const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
const password = Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
if (password.length < 12) {
  throw new Error("La contraseña debe tener al menos 12 caracteres.");
}
const salt = randomBytes(16);
const derived = await deriveScrypt(password, salt);
process.stdout.write("scrypt:131072:8:1:" + salt.toString("base64") + ":" + derived.toString("base64") + "\n");

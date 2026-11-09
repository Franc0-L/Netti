import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
const password = Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
if (password.length < 12) {
  throw new Error("La contraseña debe tener al menos 12 caracteres.");
}
const salt = randomBytes(16);
const derived = await scrypt(password, salt, 64, {
  N: 131072,
  r: 8,
  p: 1,
  maxmem: 256 * 1024 * 1024,
}) as Buffer;
process.stdout.write("scrypt:131072:8:1:" + salt.toString("base64") + ":" + derived.toString("base64") + "\n");

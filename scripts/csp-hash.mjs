/**
 * csp-hash.mjs — Recalcula el hash del importmap en la política de seguridad de index.html.
 *
 * El importmap es el único <script> en línea; la CSP lo autoriza por su hash
 * SHA-256. Si se edita el importmap (p. ej. al actualizar Three.js), ejecuta:
 *   npm run csp-hash          (actualiza index.html)
 *   npm run csp-hash -- --check   (solo comprueba; falla si no coincide)
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const file = new URL('../index.html', import.meta.url);
const html = await readFile(file, 'utf8');
const match = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
if (!match) throw new Error('No se encontró el importmap en index.html');
const hash = createHash('sha256').update(match[1], 'utf8').digest('base64');
const updated = html.replace(/'sha256-[^']*'/, `'sha256-${hash}'`);

if (process.argv.includes('--check')) {
  if (updated !== html) {
    console.error(`El hash CSP del importmap no coincide. Esperado: sha256-${hash}. Ejecuta npm run csp-hash.`);
    process.exit(1);
  }
  console.log(`Hash CSP del importmap correcto (sha256-${hash}).`);
} else {
  await writeFile(file, updated);
  console.log(`CSP actualizada: sha256-${hash}`);
}

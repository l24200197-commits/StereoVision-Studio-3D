/**
 * check.mjs — Comprobaciones estáticas sin dependencias:
 *   · sintaxis de todos los .js (node --check),
 *   · hash CSP del importmap,
 *   · sin TODO/FIXME en el código de la aplicación,
 *   · rutas relativas en index.html (requisito de GitHub Pages).
 */
import { readdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
let failures = 0;
const fail = (message) => { failures += 1; console.error(`✗ ${message}`); };

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

const sources = [];
for await (const file of walk(join(ROOT, 'assets', 'js'))) if (file.endsWith('.js')) sources.push(file);
for (const file of sources) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    fail(`Sintaxis: ${file}\n${error.stderr}`);
  }
  const text = await readFile(file, 'utf8');
  if (/\b(TODO|FIXME|XXX)\b/.test(text)) fail(`Marcador pendiente en ${file}`);
}
console.log(`✓ Sintaxis revisada en ${sources.length} archivos JS`);

try {
  execFileSync(process.execPath, [join(ROOT, 'scripts', 'csp-hash.mjs'), '--check'], { stdio: 'inherit' });
} catch {
  fail('Hash CSP del importmap');
}

const html = await readFile(join(ROOT, 'index.html'), 'utf8');
const absolute = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);
if (absolute.length) fail(`Rutas absolutas en index.html (rompen GitHub Pages): ${absolute.join(', ')}`);
else console.log('✓ Rutas de index.html relativas');

if (failures) {
  console.error(`${failures} comprobación(es) fallida(s)`);
  process.exit(1);
}

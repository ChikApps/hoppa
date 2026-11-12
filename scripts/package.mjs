// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * Packs dist/ into release/hoppa-<version>.zip and prints its SHA-256.
 * It fails when a file that must not be published is inside the package.
 * Build first: npm run build
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const FORBIDDEN = [/\.map$/, /(^|\/)\.env/, /(^|\/)\.git/, /node_modules/, /(^|\/)tests?(\/|$)/, /\.test\./, /CHROMEWEBSTORE\.md$/,
  /package(-lock)?\.json$/, /(^|\/)scripts(\/|$)/, /eslint/, /README\.md$/, /\.DS_Store$/, /thumbs\.db$/i];

async function list(dir, base) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const relative = base ? base + '/' + entry.name : entry.name;
    if (entry.isDirectory()) out.push(...await list(path.join(dir, entry.name), relative));
    else out.push(relative);
  }
  return out;
}

if (!existsSync(path.join(dist, 'manifest.json'))) {
  process.stderr.write('dist/ is missing. Run "npm run build" first.\n');
  process.exit(1);
}
const files = (await list(dist, '')).sort();
const bad = files.filter((file) => FORBIDDEN.some((pattern) => pattern.test(file)));
if (bad.length > 0) {
  process.stderr.write('These files must not be in the package:\n  ' + bad.join('\n  ') + '\n');
  process.exit(1);
}
const links = await readFile(path.join(root, 'src', 'pages', 'links.js'), 'utf8');
if (/_URL = '';/.test(links)) {
  process.stdout.write('NOTE: the source code address or the privacy policy address is still empty (src/pages/links.js).\n' +
    '      Fine for a test package. Both must be filled in before the store.\n');
}

const version = JSON.parse(await readFile(path.join(dist, 'manifest.json'), 'utf8')).version;
const out = path.join(root, 'release', 'hoppa-' + version + '.zip');
await mkdir(path.dirname(out), { recursive: true });
await rm(out, { force: true });
// -X leaves out extra file attributes, so the same files give the same package.
const zipped = spawnSync('zip', ['-X', '-q', out, ...files], { cwd: dist, stdio: 'inherit' });
if (zipped.status !== 0) {
  process.stderr.write('Packing failed. The "zip" program is needed.\n');
  process.exit(1);
}
const hash = createHash('sha256').update(await readFile(out)).digest('hex');
process.stdout.write('Package: ' + path.relative(root, out) + ' (' + files.length + ' files)\nSHA-256: ' + hash + '\n');

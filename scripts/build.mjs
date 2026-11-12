// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * Builds the extension into dist/. Local only: no network, no minification,
 * no obfuscation. The security check runs at the end and fails the build.
 */
import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRIGGER } from '../src/config.js';
import { runSecurityCheck } from './check-security.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');
const metaDir = path.join(root, 'build');

const BANNER = '/*! Hoppa. Copyright (C) 2026 ChikApps. SPDX-License-Identifier: GPL-2.0-or-later. ' +
  'Bundled libraries and their licenses: see THIRD_PARTY_NOTICES.md. */';

const ENTRIES = {
  'content': 'content/main.js',
  'background': 'background/main.js',
  'js/popup': 'pages/popup.js',
  'js/options': 'pages/options.js',
  'js/welcome': 'pages/welcome.js'
};

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function copyTemplate(from, to, value) {
  const text = await readFile(from, 'utf8');
  await mkdir(path.dirname(to), { recursive: true });
  await writeFile(to, text.replaceAll('{{T}}', value));
}

async function main() {
  await rm(dist, { recursive: true, force: true });
  await rm(metaDir, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  await mkdir(metaDir, { recursive: true });

  const result = await build({
    absWorkingDir: root,
    entryPoints: Object.fromEntries(Object.entries(ENTRIES).map(([out, file]) => [out, path.join('src', file)])),
    outdir: dist,
    bundle: true,
    format: 'iife',
    target: 'chrome120',
    platform: 'browser',
    charset: 'utf8',
    minify: false,
    sourcemap: false,
    legalComments: 'inline',
    banner: { js: BANNER },
    metafile: true,
    logLevel: 'warning'
  });
  await writeFile(path.join(metaDir, 'meta.json'), JSON.stringify(result.metafile, null, 2));

  // Static files. The trigger is filled in from config.js, so it is written in one place only.
  for (const page of ['popup.html', 'options.html', 'welcome.html']) {
    await copyTemplate(path.join(src, 'pages', page), path.join(dist, page), escapeHtml(TRIGGER));
  }
  for (const locale of await readdir(path.join(src, '_locales'))) {
    await copyTemplate(
      path.join(src, '_locales', locale, 'messages.json'),
      path.join(dist, '_locales', locale, 'messages.json'),
      JSON.stringify(TRIGGER).slice(1, -1)
    );
  }
  await cp(path.join(src, 'manifest.json'), path.join(dist, 'manifest.json'));
  await cp(path.join(src, 'pages', 'theme.js'), path.join(dist, 'js', 'theme.js'));
  await cp(path.join(src, 'pages', 'css'), path.join(dist, 'css'), { recursive: true });
  await cp(path.join(src, 'icons'), path.join(dist, 'icons'), { recursive: true });
  for (const file of ['LICENSE', 'COPYRIGHT', 'THIRD_PARTY_NOTICES.md']) {
    await cp(path.join(root, file), path.join(dist, file));
  }

  const ok = await runSecurityCheck({ root });
  if (!ok) {
    process.stderr.write('\nBuild failed: the security check did not pass.\n');
    process.exit(1);
  }
  process.stdout.write('\nBuild complete: dist/\n');
}

main().catch((error) => {
  process.stderr.write(String(error && error.stack ? error.stack : error) + '\n');
  process.exit(1);
});

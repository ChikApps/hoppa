// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * Checks the security check itself: plants one violation at a time in a
 * temporary copy of the project and makes sure that the check fails on it.
 * A check that never fails proves nothing. Build first: npm run build
 */
import { appendFile, cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSecurityCheck } from './check-security.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COPY = ['src', 'dist', 'build', 'package.json', 'package-lock.json', 'CHROMEWEBSTORE.md', 'security-allowlist.txt', 'THIRD_PARTY_NOTICES.md', 'LICENSE', 'COPYRIGHT'];

const edit = async (file, change) => writeFile(file, change(await readFile(file, 'utf8')));
const editJson = async (file, change) => edit(file, (text) => {
  const data = JSON.parse(text);
  change(data);
  return JSON.stringify(data, null, 2);
});

const VIOLATIONS = [
  ['markup built from a string in our source', (dir) => appendFile(path.join(dir, 'src/pages/ui.js'), '\nexport function bad(node, text) { node.inner' + 'HTML = text; }\n')],
  ['running text as code in our source', (dir) => appendFile(path.join(dir, 'src/core/state.js'), '\nexport const bad = (text) => ev' + 'al(text);\n')],
  ['a network request in our source', (dir) => appendFile(path.join(dir, 'src/content/main.js'), '\nfet' + 'ch("x");\n')],
  ['logging in our source', (dir) => appendFile(path.join(dir, 'src/core/engine.js'), '\ncons' + 'ole.log(1);\n')],
  ['the trigger written as a literal outside config.js', async (dir) => {
    const { TRIGGER } = await import('../src/config.js');
    await appendFile(path.join(dir, 'src/core/state.js'), "\nexport const again = '" + TRIGGER + "';\n");
  }],
  ['a source file without the license header', (dir) => edit(path.join(dir, 'src/limits.js'), (text) => text.split('\n').slice(2).join('\n'))],
  ['a script written inside a page', (dir) => edit(path.join(dir, 'src/pages/popup.html'), (text) => text.replace('</body>', '<script>window.x = 1</script></body>'))],
  ['an inline event handler in a page', (dir) => edit(path.join(dir, 'src/pages/options.html'), (text) => text.replace('<button type="button" class="btn primary" id="btnNew">', '<button type="button" class="btn primary" id="btnNew" onclick="x()">'))],
  ['an inline style in a page', (dir) => edit(path.join(dir, 'src/pages/welcome.html'), (text) => text.replace('<div class="wl">', '<div class="wl" style="color:red">'))],
  ['a network request inside the built package', (dir) => appendFile(path.join(dir, 'dist/js/popup.js'), '\nfet' + 'ch("x");\n')],
  ['a network interface inside a bundled library', (dir) => appendFile(path.join(dir, 'dist/background.js'), '\nnew XMLHttp' + 'Request();\n')],
  ['an address that is not in the allowlist', (dir) => appendFile(path.join(dir, 'dist/js/options.js'), '\nconst home = "https://collector.example/v1";\n')],
  ['page messaging in the content script', (dir) => appendFile(path.join(dir, 'dist/content.js'), '\nwindow.post' + 'Message({ a: 1 }, "*");\n')],
  ['listening to page messages in the content script', (dir) => appendFile(path.join(dir, 'dist/content.js'), '\nwindow.addEventListener("mess' + 'age", () => {});\n')],
  ['logging in the content script', (dir) => appendFile(path.join(dir, 'dist/content.js'), '\ncons' + 'ole.log("typed");\n')],
  ['an extra permission in the manifest', (dir) => editJson(path.join(dir, 'dist/manifest.json'), (m) => { m.permissions.push('tabs'); })],
  ['host permissions in the manifest', (dir) => editJson(path.join(dir, 'dist/manifest.json'), (m) => { m.host_permissions = ['<all_urls>']; })],
  ['files open to web pages', (dir) => editJson(path.join(dir, 'dist/manifest.json'), (m) => { m.web_accessible_resources = [{ resources: ['popup.html'], matches: ['<all_urls>'] }]; })],
  ['messages from web pages allowed', (dir) => editJson(path.join(dir, 'dist/manifest.json'), (m) => { m.externally_connectable = { matches: ['https://example.com/*'] }; })],
  ['an update address in the manifest', (dir) => editJson(path.join(dir, 'dist/manifest.json'), (m) => { m.update_url = 'https://example.com/u.xml'; })],
  ['a weaker content security policy', (dir) => editJson(path.join(dir, 'dist/manifest.json'), (m) => { m.content_security_policy.extension_pages = "script-src 'self'; object-src 'self'"; })],
  ['a content script in the page\'s own script context', (dir) => editJson(path.join(dir, 'dist/manifest.json'), (m) => { m.content_scripts[0].world = 'MAIN'; })],
  ['a permission without a justification', (dir) => edit(path.join(dir, 'CHROMEWEBSTORE.md'), (text) => text.replace(/^\| `storage` .*$/m, ''))],
  ['a version range in package.json', (dir) => editJson(path.join(dir, 'package.json'), (p) => { p.dependencies['@hebcal/core'] = '^6.16.0'; })],
  ['a dependency that was not approved', (dir) => editJson(path.join(dir, 'package.json'), (p) => { p.dependencies['left-pad'] = '1.3.0'; })],
  ['a library inside the package that was not approved', (dir) => editJson(path.join(dir, 'build/meta.json'), (meta) => {
    const first = Object.values(meta.outputs)[0];
    first.inputs['node_modules/some-tracker/index.js'] = { bytesInOutput: 10 };
  })],
  ['a library missing from the notices', (dir) => edit(path.join(dir, 'THIRD_PARTY_NOTICES.md'), (text) => text.replace('## quick-lru', '## removed'))],
  ['a source map inside the package', (dir) => writeFile(path.join(dir, 'dist/content.js.map'), '{}')],
  ['the store document inside the package', (dir) => writeFile(path.join(dir, 'dist/CHROMEWEBSTORE.md'), 'x')],
  ['the license missing from the package', (dir) => rm(path.join(dir, 'dist/LICENSE'))]
];

const silence = process.stdout.write.bind(process.stdout);
let failed = 0;
const base = await mkdtemp(path.join(process.env.HOPPA_TMP || os.tmpdir(), 'hoppa-check-'));
try {
  const quiet = async (dir) => {
    process.stdout.write = () => true;
    try {
      return await runSecurityCheck({ root: dir, skipAudit: true });
    } finally {
      process.stdout.write = silence;
    }
  };
  const copy = async (name) => {
    const dir = path.join(base, name);
    for (const item of COPY) await cp(path.join(root, item), path.join(dir, item), { recursive: true });
    await symlink(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
    return dir;
  };

  const clean = await copy('clean');
  const cleanOk = await quiet(clean);
  silence((cleanOk ? '  ok    ' : '  FAIL  ') + 'an untouched copy passes\n');
  if (!cleanOk) failed += 1;

  for (let i = 0; i < VIOLATIONS.length; i++) {
    const [name, plant] = VIOLATIONS[i];
    const dir = await copy('v' + i);
    await plant(dir);
    const passed = await quiet(dir);
    silence((passed ? '  FAIL  ' : '  ok    ') + 'caught: ' + name + '\n');
    if (passed) failed += 1;
    await rm(dir, { recursive: true, force: true });
  }
} finally {
  process.stdout.write = silence;
  await rm(base, { recursive: true, force: true });
}
const total = VIOLATIONS.length + 1;
silence('\nSelf-test of the security check: ' + (total - failed) + ' passed, ' + failed + ' failed, ' + total + ' total\n');
process.exitCode = failed === 0 ? 0 : 1;

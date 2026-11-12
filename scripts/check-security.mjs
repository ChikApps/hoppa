// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * The automatic security check (section 9 of the developer notes).
 * It runs at the end of every build, and the build fails when it fails.
 * Run it alone with: npm run check:security (after a build).
 */
import { transform } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.html', '.css', '.json', '.svg', '.md', '.txt', '']);

/* Words that must never appear in our own source: text of a user is always text, never code. */
const SOURCE_WORDS = [
  'innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'createContextualFragment', 'DOMParser',
  'setHTMLUnsafe', 'srcdoc', 'java' + 'script:', 'insertHTML', 'text/html', 'importScripts', 'XMLHttpRequest',
  'WebSocket', 'EventSource', 'sendBeacon', 'onMessageExternal', 'onConnectExternal', 'chrome.scripting',
  'chrome.debugger', 'chrome.webRequest', 'chrome.cookies', 'chrome.history', 'chrome.downloads'
];
const SOURCE_PATTERNS = [
  [/\beval\s*\(/, 'eval('],
  [/\bnew\s+Function\b/, 'new Function'],
  [/\bset(?:Timeout|Interval)\s*\(\s*['"`]/, 'a timer with a string'],
  [/\bimport\s*\(/, 'dynamic import()'],
  [/\bfetch\s*\(/, 'fetch('],
  [/\bconsole\s*\./, 'console.']
];

/* Network interfaces that must not exist anywhere in the built package, libraries included. */
const DIST_PATTERNS = [
  [/\bfetch\s*\(/, 'fetch('],
  [/XMLHttpRequest/, 'XMLHttpRequest'],
  [/WebSocket/, 'WebSocket'],
  [/EventSource/, 'EventSource'],
  [/sendBeacon/, 'sendBeacon'],
  [/importScripts/, 'importScripts'],
  [/onMessageExternal/, 'onMessageExternal'],
  [/onConnectExternal/, 'onConnectExternal'],
  [/externally_connectable/, 'externally_connectable'],
  [/\beval\s*\(/, 'eval('],
  [/\bnew\s+Function\b/, 'new Function']
];

/* The content script runs inside every site, so it has extra rules. */
const CONTENT_PATTERNS = [
  [/postMessage/, 'postMessage'],
  [/addEventListener\s*\(\s*['"`]message['"`]/, "addEventListener('message'"],
  [/\bconsole\s*\./, 'console.'],
  [/\bworld\b/, 'world']
];

const HTML_PATTERNS = [
  [/<script(?![^>]*\bsrc=)[^>]*>/i, 'a script written inside the page'],
  [/\son[a-z]+\s*=/i, 'an inline event handler'],
  [/\sstyle\s*=/i, 'an inline style'],
  [/<style[\s>]/i, 'a style block'],
  [/<iframe[\s>]/i, 'an inner frame'],
  [/\bdata:/i, 'a data: address'],
  [/<base[\s>]/i, 'a base element']
];

const ALLOWED_PERMISSIONS = ['storage'];
const FORBIDDEN_MANIFEST_KEYS = [
  'externally_connectable', 'web_accessible_resources', 'sandbox', 'optional_permissions',
  'optional_host_permissions', 'update_url', 'host_permissions', 'key', 'oauth2'
];
const REQUIRED_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; " +
  "connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const ALLOWED_MATCHES = ['<all_urls>'];

/* The only runtime dependency, and the only packages that may end up inside the bundles. */
const APPROVED_DEPENDENCIES = ['@hebcal/core'];
const APPROVED_BUNDLED = ['@hebcal/core', '@hebcal/hdate', 'quick-lru'];

const FORBIDDEN_DIST_FILES = [/\.map$/, /(^|\/)\.env/, /(^|\/)\.git/, /node_modules/, /(^|\/)tests?(\/|$)/, /\.test\./,
  /CHROMEWEBSTORE\.md$/, /package(-lock)?\.json$/, /(^|\/)scripts(\/|$)/, /eslint/, /README\.md$/];

const COPYRIGHT_LINE = 'Copyright (C) 2026 ChikApps';
const LICENSE_LINE = 'SPDX-License-Identifier: GPL-2.0-or-later';
const URL_RE = /https?:\/\/[^\s'"`<>)\]\\]+/g;

async function listFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(full));
    else out.push(full);
  }
  return out;
}

async function codeOnly(source) {
  // The same code without comments and without extra spaces, for searching.
  const result = await transform(source, { minifyWhitespace: true, legalComments: 'none', charset: 'utf8' });
  return result.code;
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  return { status: result.status, output: String(result.stdout || '') + String(result.stderr || '') };
}

export async function runSecurityCheck(options) {
  const root = options.root;
  const src = path.join(root, 'src');
  const dist = path.join(root, 'dist');
  const rel = (file) => path.relative(root, file).split(path.sep).join('/');
  const problems = [];
  const notes = [];
  const passed = [];
  const fail = (section, message) => problems.push('[' + section + '] ' + message);
  let mark = 0;
  const pass = (message) => {
    if (problems.length === mark) passed.push(message);
    mark = problems.length;
  };

  const { TRIGGER } = await import(pathToFileURL(path.join(src, 'config.js')).href);

  /* ---- 9.1 our source: forbidden words, the trigger literal, file headers ---- */
  const sourceFiles = (await listFiles(src)).filter((file) => TEXT_EXTENSIONS.has(path.extname(file)));
  const escapedTrigger = TRIGGER.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const triggerLiteral = new RegExp('([\'"`])' + escapedTrigger + '\\1');
  for (const file of sourceFiles) {
    const text = await readFile(file, 'utf8');
    const name = rel(file);
    const ext = path.extname(file);
    if (ext === '.js' || ext === '.html') {
      for (const word of SOURCE_WORDS) if (text.includes(word)) fail('9.1', name + ': forbidden word "' + word + '"');
    }
    if (ext === '.js') {
      for (const [pattern, label] of SOURCE_PATTERNS) if (pattern.test(text)) fail('9.1', name + ': forbidden ' + label);
      if (name !== 'src/config.js' && triggerLiteral.test(text)) {
        fail('trigger', name + ': the trigger is written as a literal. Import it from config.js');
      }
      const head = text.split('\n').slice(0, 4).join('\n');
      if (!head.includes(COPYRIGHT_LINE) || !head.includes(LICENSE_LINE)) fail('license', name + ': missing the copyright and license header');
    }
    if (ext === '.html') {
      for (const [pattern, label] of HTML_PATTERNS) if (pattern.test(text)) fail('9.3', name + ': ' + label);
      if (!text.includes(COPYRIGHT_LINE) || !text.includes(LICENSE_LINE)) fail('license', name + ': missing the copyright and license header');
    }
  }
  pass('9.1 source: no forbidden words in ' + sourceFiles.length + ' files; the trigger is defined in config.js only');

  /* ---- the built package ---- */
  if (!existsSync(path.join(dist, 'manifest.json'))) {
    fail('build', 'dist/ is missing. Run "npm run build" first');
    return report();
  }
  const distFiles = await listFiles(dist);
  const allowlist = (await readFile(path.join(root, 'security-allowlist.txt'), 'utf8'))
    .split('\n').map((line) => line.trim()).filter((line) => line.length > 0 && !line.startsWith('#'));

  /* ---- 9.3 no network and no remote code, libraries included ---- */
  let urlCount = 0;
  for (const file of distFiles) {
    const name = rel(file);
    const ext = path.extname(file);
    for (const pattern of FORBIDDEN_DIST_FILES) if (pattern.test(name.replace(/^dist\//, ''))) fail('9.9', name + ': this file must not be in the package');
    if (!TEXT_EXTENSIONS.has(ext)) continue;
    const text = await readFile(file, 'utf8');
    for (const url of text.match(URL_RE) || []) {
      urlCount += 1;
      const clean = url.replace(/[.,;:]+$/, '');
      if (!allowlist.includes(clean)) fail('9.3', name + ': address not in security-allowlist.txt: ' + clean);
    }
    if (ext === '.js') {
      const code = await codeOnly(text);
      for (const [pattern, label] of DIST_PATTERNS) if (pattern.test(code)) fail('9.3', name + ': forbidden ' + label);
      if (name === 'dist/content.js') {
        for (const [pattern, label] of CONTENT_PATTERNS) if (pattern.test(code)) fail('9.5', name + ': forbidden ' + label);
      }
    }
    if (ext === '.html') {
      for (const [pattern, label] of HTML_PATTERNS) if (pattern.test(text)) fail('9.3', name + ': ' + label);
    }
    if (ext === '.css' && /@import|url\s*\(/i.test(text)) fail('9.3', name + ': a style sheet must not load anything');
  }
  pass('9.3 + 9.5 package: no network interfaces in ' + distFiles.length + ' files; ' + urlCount + ' addresses, all in the allowlist; ' +
    'content script: no page messaging, no logging');

  /* ---- 9.4 the manifest against the allowed list ---- */
  const manifest = JSON.parse(await readFile(path.join(dist, 'manifest.json'), 'utf8'));
  if (manifest.manifest_version !== 3) fail('9.4', 'manifest_version must be 3');
  const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
  for (const permission of permissions) {
    if (!ALLOWED_PERMISSIONS.includes(permission)) fail('9.4', 'permission not allowed: ' + permission);
  }
  for (const key of FORBIDDEN_MANIFEST_KEYS) if (key in manifest) fail('9.4', 'manifest key not allowed: ' + key);
  const csp = manifest.content_security_policy && manifest.content_security_policy.extension_pages;
  if (csp !== REQUIRED_CSP) fail('9.3', 'the content security policy of the pages is not the required one');
  if (manifest.content_security_policy && 'sandbox' in manifest.content_security_policy) fail('9.3', 'a sandbox policy is not allowed');
  const scripts = Array.isArray(manifest.content_scripts) ? manifest.content_scripts : [];
  for (const script of scripts) {
    if ('world' in script) fail('9.5', 'a content script must not choose a script context');
    for (const match of script.matches || []) if (!ALLOWED_MATCHES.includes(match)) fail('9.4', 'match pattern not allowed: ' + match);
    if (script.css) fail('9.5', 'a content script must not add styles to pages');
  }
  const storeDoc = await readFile(path.join(root, 'CHROMEWEBSTORE.md'), 'utf8').catch(() => '');
  for (const item of [...permissions, ...ALLOWED_MATCHES]) {
    const row = new RegExp('^\\|\\s*`' + item.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '`\\s*\\|[^|]+\\|\\s*\\S[^|]{30,}\\|', 'm');
    if (!row.test(storeDoc)) fail('9.4', 'CHROMEWEBSTORE.md has no justification row for ' + item);
  }
  pass('9.4 manifest: permissions ' + JSON.stringify(permissions) + ', no forbidden keys, required policy, every permission is justified');

  /* ---- 9.7 dependencies ---- */
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const dependencies = Object.keys(pkg.dependencies || {});
  if (JSON.stringify(dependencies.sort()) !== JSON.stringify(APPROVED_DEPENDENCIES.slice().sort())) {
    fail('9.7', 'the dependencies are not the approved list: ' + dependencies.join(', '));
  }
  for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) fail('9.7', name + ': the version is not exact (' + version + ')');
  }
  if (!existsSync(path.join(root, 'package-lock.json'))) fail('9.7', 'package-lock.json is missing');

  const notices = await readFile(path.join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8').catch(() => '');
  const metaFile = path.join(root, 'build', 'meta.json');
  if (!existsSync(metaFile)) {
    fail('9.7', 'build/meta.json is missing. Run "npm run build"');
  } else {
    const meta = JSON.parse(await readFile(metaFile, 'utf8'));
    const bundled = new Set();
    for (const output of Object.values(meta.outputs)) {
      for (const [input, info] of Object.entries(output.inputs)) {
        if (info.bytesInOutput === 0) continue;
        const found = /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(input);
        if (found) bundled.add(found[1]);
      }
    }
    for (const name of bundled) {
      if (!APPROVED_BUNDLED.includes(name)) {
        fail('9.7', 'a library that is not approved is inside the package: ' + name);
        continue;
      }
      const installed = JSON.parse(await readFile(path.join(root, 'node_modules', name, 'package.json'), 'utf8'));
      if (!notices.includes('## ' + name + '\n') || !notices.includes('Version: ' + installed.version)) {
        fail('9.7', 'THIRD_PARTY_NOTICES.md does not list ' + name + ' ' + installed.version);
      }
    }
    pass('9.7 libraries inside the package: ' + Array.from(bundled).sort().join(', '));
  }

  /* ---- licenses in the package ---- */
  for (const file of ['LICENSE', 'COPYRIGHT', 'THIRD_PARTY_NOTICES.md']) {
    if (!existsSync(path.join(dist, file))) fail('license', file + ' is missing from the package');
  }
  const license = await readFile(path.join(root, 'LICENSE'), 'utf8').catch(() => '');
  if (!license.includes('GNU GENERAL PUBLIC LICENSE') || !license.includes('Version 2, June 1991')) fail('license', 'LICENSE is not the GPL version 2 text');
  const size = (await stat(path.join(dist, 'content.js'))).size;
  pass('license: LICENSE, COPYRIGHT and THIRD_PARTY_NOTICES.md are in the package; content script is ' + Math.round(size / 1024) + ' KB');

  /* ---- 9.7 npm audit ---- */
  const allowUnverified = process.env.HOPPA_ALLOW_UNVERIFIED_AUDIT === '1';
  // Only the self-test of this script skips the audits: it checks the other rules on changed copies.
  if (options.skipAudit === true) return report();
  const offline = /E?403|Failed to download|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|network/i;
  const audits = [
    ['npm audit --omit=dev --audit-level=high', ['audit', '--omit=dev', '--audit-level=high']],
    ['npm audit signatures', ['audit', 'signatures']]
  ];
  for (const [label, args] of audits) {
    const result = run('npm', args, root);
    if (result.status === 0) {
      pass('9.7 ' + label + ': passed');
    } else if (offline.test(result.output) && !/vulnerabilit/i.test(result.output)) {
      const message = label + ': NOT RUN (the registry could not be reached from this machine)';
      if (allowUnverified) notes.push(message);
      else fail('9.7', message + '. Run on a machine with access, or set HOPPA_ALLOW_UNVERIFIED_AUDIT=1 for a local build');
    } else {
      fail('9.7', label + ': failed\n' + result.output.trim().split('\n').slice(-12).join('\n'));
    }
  }

  return report();

  function report() {
    const write = (text) => process.stdout.write(text + '\n');
    write('\nSecurity check');
    for (const line of passed) write('  ok    ' + line);
    for (const line of notes) write('  NOTE  ' + line);
    for (const line of problems) write('  FAIL  ' + line);
    write(problems.length === 0
      ? '  Result: passed' + (notes.length > 0 ? ' (with ' + notes.length + ' item(s) that were not run, see NOTE)' : '')
      : '  Result: FAILED (' + problems.length + ')');
    return problems.length === 0;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  runSecurityCheck({ root }).then((ok) => process.exit(ok ? 0 : 1), (error) => {
    process.stderr.write(String(error && error.stack ? error.stack : error) + '\n');
    process.exit(1);
  });
}

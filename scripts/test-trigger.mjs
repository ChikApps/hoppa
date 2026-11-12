// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * Proves that the trigger is defined in one place only: copies the source and
 * the unit tests to a temporary folder, changes the single line in config.js
 * to a double trigger, and runs every unit test there. They must all pass.
 */
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, symlink, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OTHER_TRIGGER = '//';

const work = await mkdtemp(path.join(process.env.HOPPA_TMP || os.tmpdir(), 'hoppa-trigger-'));
try {
  await cp(path.join(root, 'src'), path.join(work, 'src'), { recursive: true });
  await cp(path.join(root, 'tests', 'unit'), path.join(work, 'tests', 'unit'), { recursive: true });
  await mkdir(path.join(work, 'tests', 'fixtures'), { recursive: true });
  await cp(path.join(root, 'tests', 'fixtures', 'make-evil.mjs'), path.join(work, 'tests', 'fixtures', 'make-evil.mjs'));
  await cp(path.join(root, 'package.json'), path.join(work, 'package.json'));
  await symlink(path.join(root, 'node_modules'), path.join(work, 'node_modules'), 'dir');

  const configFile = path.join(work, 'src', 'config.js');
  const config = await readFile(configFile, 'utf8');
  const line = /export const TRIGGER = '[^']+';/;
  if (!line.test(config)) throw new Error('config.js: the TRIGGER line was not found');
  await writeFile(configFile, config.replace(line, "export const TRIGGER = '" + OTHER_TRIGGER + "';"));

  process.stdout.write('Running the unit tests with the trigger ' + OTHER_TRIGGER + '\n');
  const result = spawnSync(process.execPath, ['--test', 'tests/unit/*.test.js'], { cwd: work, stdio: 'inherit' });
  process.exitCode = result.status === 0 ? 0 : 1;
} finally {
  await rm(work, { recursive: true, force: true });
}

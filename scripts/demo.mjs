#!/usr/bin/env node
// Fixed project/key selection prevents accidental use of the ordinary database.
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const envPath = join(root, '.env.demo');
const args = ['compose', '-p', 'openjio-demo', '--env-file', envPath, '-f', 'compose.yaml', '-f', 'compose.demo.yaml'];
const command = process.argv[2] || 'up';
if (!['up', 'seed', 'status', 'down'].includes(command)) throw new Error('Use: node scripts/demo.mjs [up|seed|status|down]');
function run(file, parameters, env = process.env) {
  const result = spawnSync(file, parameters, { cwd: root, env, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${file} exited unsuccessfully (${result.status ?? result.error?.code}).`);
}
try {
  try {
    const info = await lstat(envPath);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('.env.demo must be a regular private file.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (command !== 'up') throw new Error('Start the isolated demo first: node scripts/demo.mjs up');
    const temp = await mkdtemp(join(tmpdir(), 'openjio-demo-setup-'));
    try {
      run(process.execPath, ['scripts/setup-docker.mjs'], { ...process.env, OPENJIO_SETUP_DIR: temp });
      let bind = '127.0.0.1';
      try {
        const ordinary = await readFile(join(root, '.env.docker'), 'utf8');
        bind = ordinary.match(/^APP_BIND=([^\r\n]+)$/m)?.[1] || bind;
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const host = bind === '0.0.0.0' ? 'localhost' : bind;
      const content = (await readFile(join(temp, '.env.docker'), 'utf8'))
        .replace(/^APP_PORT=.*$/m, 'APP_PORT=8082')
        .replace(/^APP_BIND=.*$/m, `APP_BIND=${bind}`)
        .replace(/^APP_URL=.*$/m, `APP_URL=http://${host}:8082`);
      await writeFile(envPath, `${content}OPENJIO_DEMO_PASSWORD=OpenJioDemo123!\n`, { flag: 'wx', mode: 0o600 });
    } finally { await rm(temp, { recursive: true, force: true }); }
  }
  if (command === 'up') run('docker', [...args, 'up', '--build', '-d', '--wait']);
  if (command === 'seed' || command === 'up') run('docker', [...args, 'exec', '-T', 'api', 'node', 'src/demo-bootstrap.js']);
  if (command === 'status') run('docker', [...args, 'ps']);
  if (command === 'down') run('docker', [...args, 'down']);
  if (command === 'up') {
    const content = await readFile(envPath, 'utf8');
    console.log(`Demo ready: ${content.match(/^APP_URL=(.*)$/m)?.[1]}`);
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }

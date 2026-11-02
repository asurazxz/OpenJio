#!/usr/bin/env node
import { randomBytes, createHmac } from 'node:crypto';
import { open, readFile, lstat, stat, chown } from 'node:fs/promises';
import { join } from 'node:path';

const required = ['POSTGRES_PASSWORD','JWT_SECRET','ANON_KEY','SERVICE_ROLE_KEY','APP_PORT','APP_URL','APP_BIND'];
const dir = process.env.OPENJIO_SETUP_DIR || process.cwd();
const path = join(dir,'.env.docker');
const base64url = value => Buffer.from(value).toString('base64url');
const secret = () => randomBytes(32).toString('hex');

function jwt(role, key, now) {
  const header = base64url(JSON.stringify({alg:'HS256',typ:'JWT'}));
  const payload = base64url(JSON.stringify({iss:'supabase',role,iat:now,exp:now+10*365*24*60*60}));
  const body = `${header}.${payload}`;
  return `${body}.${createHmac('sha256',key).update(body).digest('base64url')}`;
}

function parse(contents) {
  const values = new Map();
  for (const line of contents.split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (match) values.set(match[1],match[2]);
  }
  return values;
}

async function main() {
  const now = Math.floor(Date.now()/1000);
  const directory = await stat(dir);
  const jwtSecret = secret();
  const values = [
    ['POSTGRES_PASSWORD',secret()], ['JWT_SECRET',jwtSecret],
    ['ANON_KEY',jwt('anon',jwtSecret,now)], ['SERVICE_ROLE_KEY',jwt('service_role',jwtSecret,now)],
    ['APP_PORT','8080'], ['APP_URL','http://localhost:8080'], ['APP_BIND','127.0.0.1'],
  ];
  const content = `${values.map(([key,value])=>`${key}=${value}`).join('\n')}\n`;
  let file;
  try {
    file = await open(path,'wx',0o600);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existingStat = await lstat(path);
    if (existingStat.isSymbolicLink()) throw new Error('Existing .env.docker is a symlink; it was left unchanged.');
    if (!existingStat.isFile()) throw new Error('Existing .env.docker is not a regular file; it was left unchanged.');
    if (process.getuid?.() === 0 && (existingStat.uid !== directory.uid || existingStat.gid !== directory.gid)) {
      await chown(path,directory.uid,directory.gid);
    }
    const existing = await readFile(path,'utf8');
    const parsed = parse(existing);
    const missing = required.filter(key=>!parsed.get(key));
    if (missing.length) throw new Error('Existing .env.docker is incomplete; it was left unchanged.');
    process.stdout.write('Existing .env.docker is valid; credentials were preserved.\n');
    return;
  }
  try {
    if (process.getuid?.() === 0) await file.chown(directory.uid,directory.gid);
    await file.writeFile(content,'utf8');
  } finally {
    await file.close();
  }
  process.stdout.write('Created .env.docker with private local credentials.\n');
}

main().catch(error=>{
  process.stderr.write(`${error.message || 'Unable to prepare local Docker credentials.'}\n`);
  process.exitCode=1;
});

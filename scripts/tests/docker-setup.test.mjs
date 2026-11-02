import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, lstat, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';

const root = new URL('../../', import.meta.url).pathname;
const run = (script, env={}) => spawnSync(process.execPath, [join(root,'scripts',script)], {cwd:root,encoding:'utf8',env:{...process.env,...env}});
const payload = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
const sign = (secret, encoded) => createHmac('sha256',secret).update(encoded).digest('base64url');

test('setup creates private random credentials and does not replace them on rerun', async t => {
  const dir=await mkdtemp(join(tmpdir(),'openjio-setup-')); t.after(()=>rm(dir,{recursive:true,force:true}));
  const env={OPENJIO_SETUP_DIR:dir};
  const first=run('setup-docker.mjs',env); assert.equal(first.status,0,first.stderr);
  const file=join(dir,'.env.docker'); const original=await readFile(file,'utf8');
  const fileStat=await lstat(file); const mode=fileStat.mode & 0o777; assert.equal(mode,0o600);
  const dirStat=await lstat(dir); assert.equal(fileStat.uid,dirStat.uid); assert.equal(fileStat.gid,dirStat.gid);
  const values=Object.fromEntries(original.trim().split('\n').map(line=>line.split(/=(.*)/s).slice(0,2)));
  assert.equal(values.APP_PORT,'8080'); assert.equal(values.APP_URL,'http://localhost:8080'); assert.equal(values.APP_BIND,'127.0.0.1');
  assert.match(values.POSTGRES_PASSWORD,/^[a-f0-9]{64}$/); assert.match(values.JWT_SECRET,/^[a-f0-9]{64}$/);
  const now=Math.floor(Date.now()/1000);
  for (const [key,role] of [['ANON_KEY','anon'],['SERVICE_ROLE_KEY','service_role']]) {
    const [head,body,signature]=values[key].split('.');
    assert.deepEqual(JSON.parse(Buffer.from(head,'base64url')),{alg:'HS256',typ:'JWT'});
    assert.equal(sign(values.JWT_SECRET,`${head}.${body}`),signature);
    const claims=payload(values[key]); assert.equal(claims.role,role); assert.equal(claims.iss,'supabase');
    assert.ok(claims.iat<=now && claims.iat>=now-10); assert.equal(claims.exp-claims.iat,10*365*24*60*60);
  }
  assert.equal(first.stdout.includes(values.JWT_SECRET),false);
  const second=run('setup-docker.mjs',env); assert.equal(second.status,0,second.stderr); assert.equal(await readFile(file,'utf8'),original);
});

test('setup refuses incomplete existing credentials and leaves them untouched', async t => {
  const dir=await mkdtemp(join(tmpdir(),'openjio-setup-')); t.after(()=>rm(dir,{recursive:true,force:true}));
  const file=join(dir,'.env.docker'); await writeFile(file,'POSTGRES_PASSWORD=kept\n');
  const result=run('setup-docker.mjs',{OPENJIO_SETUP_DIR:dir}); assert.notEqual(result.status,0);
  assert.equal(await readFile(file,'utf8'),'POSTGRES_PASSWORD=kept\n');
});

test('setup refuses a symlink at the credential path', async t => {
  const dir=await mkdtemp(join(tmpdir(),'openjio-setup-')); t.after(()=>rm(dir,{recursive:true,force:true}));
  const outside=join(dir,'outside'); const file=join(dir,'.env.docker'); await writeFile(outside,'safe'); await symlink(outside,file);
  const result=run('setup-docker.mjs',{OPENJIO_SETUP_DIR:dir}); assert.notEqual(result.status,0);
  assert.equal(await readFile(outside,'utf8'),'safe');
});

test('live-data import copies only valid absent JSON files and preserves existing target files', async t => {
  const rootDir=await mkdtemp(join(tmpdir(),'openjio-import-')); t.after(()=>rm(rootDir,{recursive:true,force:true}));
  const source=join(rootDir,'source'); const target=join(rootDir,'target');
  await mkdir(join(source,'server/.cache'),{recursive:true}); await mkdir(join(source,'pipeline/out'),{recursive:true});
  await mkdir(join(target,'cache'),{recursive:true}); await mkdir(join(target,'pipeline'),{recursive:true});
  const input={ 'server/.cache/geoapify-results.json':'{"places":[]}', 'server/.cache/routes.json':'{"routes":[]}', 'server/.cache/geoapify-quota.json':'{"count":3}', 'server/.cache/places-catalogue.json':'{"items":[]}', 'pipeline/out/drafts.json':'{"drafts":[]}', 'pipeline/out/rawposts.json':'{"posts":[]}' };
  for (const [name,body] of Object.entries(input)) await writeFile(join(source,name),body);
  await writeFile(join(target,'cache','routes.json'),'existing');
  const env={OPENJIO_IMPORT_SOURCE:source,OPENJIO_IMPORT_TARGET:target};
  const first=run('import-live-data.mjs',env); assert.equal(first.status,0,first.stderr);
  assert.equal(await readFile(join(target,'cache','routes.json'),'utf8'),'existing');
  for (const name of ['geoapify-results.json','geoapify-quota.json','places-catalogue.json']) assert.equal(await readFile(join(target,'cache',name),'utf8'),input[`server/.cache/${name}`]);
  for (const name of ['drafts.json','rawposts.json']) assert.equal(await readFile(join(target,'pipeline',name),'utf8'),input[`pipeline/out/${name}`]);
  assert.equal(first.stdout.includes('places'),false); assert.equal((await readdir(join(target,'cache'))).length,4);
  await writeFile(join(source,'server/.cache/routes.json'),'changed');
  assert.equal(run('import-live-data.mjs',env).status,0); assert.equal(await readFile(join(target,'cache','routes.json'),'utf8'),'existing');
});

test('live-data import rejects invalid JSON without copying it', async t => {
  const rootDir=await mkdtemp(join(tmpdir(),'openjio-import-')); t.after(()=>rm(rootDir,{recursive:true,force:true}));
  const source=join(rootDir,'source'); const target=join(rootDir,'target');
  await mkdir(join(source,'server/.cache'),{recursive:true}); await mkdir(target,{recursive:true});
  await writeFile(join(source,'server/.cache/routes.json'),'{bad');
  const result=run('import-live-data.mjs',{OPENJIO_IMPORT_SOURCE:source,OPENJIO_IMPORT_TARGET:target});
  assert.notEqual(result.status,0); await assert.rejects(readFile(join(target,'cache','routes.json')));
});

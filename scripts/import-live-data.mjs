#!/usr/bin/env node
import { constants } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';

const sourceRoot = process.env.OPENJIO_IMPORT_SOURCE || process.cwd();
const targetRoot = process.env.OPENJIO_IMPORT_TARGET || '/target';
const cacheFiles = ['geoapify-results.json','routes.json','geoapify-quota.json','places-catalogue.json'];

async function regularFile(path) {
  try { return (await lstat(path)).isFile(); }
  catch (error) { if (error.code==='ENOENT') return false; throw error; }
}

async function exists(path) {
  try { await lstat(path); return true; }
  catch (error) { if (error.code==='ENOENT') return false; throw error; }
}

async function main() {
  const sources=[];
  const cacheRoot=join(sourceRoot,'server','.cache');
  for (const name of cacheFiles) {
    const path=join(cacheRoot,name);
    if (await regularFile(path)) sources.push({path,name,directory:'cache',destination:join(targetRoot,'cache',name)});
  }
  const pipelineRoot=join(sourceRoot,'pipeline','out');
  try {
    for (const entry of await readdir(pipelineRoot,{withFileTypes:true})) {
      if (entry.isFile() && entry.name.endsWith('.json')) {
        sources.push({path:join(pipelineRoot,entry.name),name:entry.name,directory:'pipeline',destination:join(targetRoot,'pipeline',entry.name)});
      }
    }
  } catch (error) {
    if (error.code!=='ENOENT') throw error;
  }

  const pending=[];
  for (const item of sources) {
    if (await exists(item.destination)) continue;
    try { JSON.parse(await readFile(item.path,'utf8')); }
    catch { throw new Error(`Invalid JSON in live data file: ${item.name}`); }
    pending.push(item);
  }

  let copied=0;
  for (const item of pending) {
    await mkdir(join(targetRoot,item.directory),{recursive:true});
    try {
      await copyFile(item.path,item.destination,constants.COPYFILE_EXCL);
      copied++;
    } catch (error) {
      if (error.code!=='EEXIST') throw error;
    }
  }
  process.stdout.write(`Imported ${copied} live data file${copied===1?'':'s'} without replacing existing data.\n`);
}

main().catch(error=>{
  process.stderr.write(`${error.message || 'Unable to import live data.'}\n`);
  process.exitCode=1;
});

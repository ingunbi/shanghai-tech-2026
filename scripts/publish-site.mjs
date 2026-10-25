#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectPublicSnapshot, LIMITS } from './validate-public-site.mjs';

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENDPOINT = 'https://shanghai-tech-2026.chris-ingunbi.chatgpt.site/__deploy';
const REPOSITORY = 'ingunbi/shanghai-tech-2026';

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--dry-run') || args.length > 1) throw new Error('Usage: node scripts/publish-site.mjs [--dry-run]');
  const dryRun = args.includes('--dry-run');
  const snapshot = await collectPublicSnapshot(resolve(PROJECT, 'dist'));
  const commit = process.env.GITHUB_SHA || execFileSync('git', ['-C', PROJECT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('A valid source commit SHA is required.');
  const runText = process.env.GITHUB_RUN_NUMBER || (dryRun ? '0' : '');
  if (!/^\d+$/.test(runText) || !Number.isSafeInteger(Number(runText))) throw new Error('GITHUB_RUN_NUMBER is required for ordered publication.');
  if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY !== REPOSITORY) throw new Error('This publisher is bound to the Shanghai repository.');
  const body = JSON.stringify({ schemaVersion: 1, repository: REPOSITORY, commit, runNumber: Number(runText), files: snapshot.files.map(file => ({ path: file.path, base64: file.bytes.toString('base64'), sha256: file.sha256 })) });
  if (Buffer.byteLength(body) > LIMITS.body) throw new Error('Encoded deployment exceeds the request size limit.');
  if (dryRun) {
    console.log(`Deployment dry run passed: ${snapshot.files.length} public files, ${snapshot.totalBytes} bytes, commit ${commit.slice(0, 12)}. No request sent.`);
    return;
  }
  const endpoint = process.env.SHANGHAI_DEPLOY_URL || ENDPOINT;
  if (endpoint !== ENDPOINT) throw new Error('Deployment endpoint must be the existing Shanghai site.');
  const token = process.env.SHANGHAI_DEPLOY_TOKEN;
  if (typeof token !== 'string' || token.length < 32 || /\s/.test(token)) throw new Error('SHANGHAI_DEPLOY_TOKEN is missing or invalid.');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' };
  let response;
  try { response = await fetch(endpoint, { method: 'POST', headers, body, redirect: 'error', signal: AbortSignal.timeout(120000) }); }
  catch { throw new Error('Deployment request could not complete; check the site and rerun this workflow.'); }
  if (!response.ok) throw new Error(`Deployment was rejected (HTTP ${response.status}); the previous release remains active.`);
  let status;
  try {
    const check = await fetch(endpoint, { headers: { Authorization: headers.Authorization, Accept: 'application/json' }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000) });
    if (!check.ok) throw new Error();
    status = await check.json();
  } catch { throw new Error('Deployment was accepted but active-release verification failed; inspect the workflow before publishing again.'); }
  const active = status.active ?? status;
  if (active.commit !== commit) throw new Error('The site did not confirm this commit as its active release.');
  console.log(`Published ${snapshot.files.length} public files from ${commit.slice(0, 12)} to https://shanghai-tech-2026.chris-ingunbi.chatgpt.site`);
}

try { await main(); }
catch (error) { console.error(`Publication failed: ${error.message}`); process.exitCode = 1; }

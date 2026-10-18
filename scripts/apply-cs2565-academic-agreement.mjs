import { config } from 'dotenv';
import { Client } from 'pg';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { courseColumns } from './lib/catalog-name-correction.mjs';
import { makeAgreementPlan, applyAgreement } from './lib/cs2565-academic-agreement.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(root, '.env'), quiet: true });
const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : null;
const mode = ['--plan', '--apply', '--rollback'].filter(x => args.includes(x));
if (mode.length !== 1) throw new Error('Choose --plan output, --apply plan, or --rollback plan');
let client;
try {
  const url = new URL(process.env.DATABASE_URL);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/aps_v2_dev')
    throw new Error('LOCAL_DEVELOPMENT_DATABASE_REQUIRED');
  const output = resolve(option(mode[0]));
  if (mode[0] !== '--plan') {
    const backup = resolve(option('--backup') ?? '');
    const within = relative(resolve(root, 'storage/backups'), backup);
    if (within.startsWith('..') || within.includes(':') || !backup.endsWith('.dump') || !existsSync(backup))
      throw new Error('VALIDATED_PRIVATE_BACKUP_REQUIRED');
    const check = spawnSync('C:/Program Files/PostgreSQL/18/bin/pg_restore.exe', ['--list', backup], { stdio: 'pipe' });
    if (check.status !== 0) throw new Error('BACKUP_ARCHIVE_INVALID');
  }
  client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  if (mode[0] === '--plan') {
    if (existsSync(output)) throw new Error('PLAN_EXISTS_USE_NEW_PATH');
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const datasets = (await client.query(`SELECT d.id, d.version, d."editVersion", d.status,
      d.source, d.policy, d.groups, d.unresolved FROM "AcademicDataset" d
      JOIN "CurriculumVersion" v ON v.id=d."curriculumVersionId"
      JOIN "Curriculum" c ON c.id=v."curriculumId" WHERE c.code='CS2565' ORDER BY d.version`)).rows;
    for (const dataset of datasets)
      dataset.courses = (await client.query(`SELECT ${courseColumns} FROM "CatalogCourse" WHERE "datasetId"=$1 ORDER BY code`, [dataset.id])).rows;
    await client.query('ROLLBACK');
    const plan = makeAgreementPlan(datasets, 'aps_v2_dev');
    writeFileSync(output, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ mode: 'dry_run', drafts: plan.datasets.map(d => ({ version: d.version, changes: d.changes.length })), skippedPublished: datasets.filter(d => d.status !== 'draft').length }));
  } else {
    const plan = JSON.parse(readFileSync(output, 'utf8'));
    if (plan.database !== 'aps_v2_dev') throw new Error('PLAN_DATABASE_MISMATCH');
    const result = await applyAgreement(client, plan, mode[0] === '--rollback');
    console.log(JSON.stringify({ mode: mode[0].slice(2), result }));
  }
} catch (error) {
  const safe = /^[A-Z_]{3,60}$/.test(error.message) ? error.message : 'ACADEMIC_AGREEMENT_FAILED';
  console.error(safe);
  process.exitCode = 1;
} finally {
  if (client) await client.end();
}

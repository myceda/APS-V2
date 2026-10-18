import { readFileSync } from 'node:fs';
import { courseColumns, stable } from './catalog-name-correction.mjs';
export const agreement = JSON.parse(readFileSync(new URL('../../src/modules/curriculum/data/cs2565-academic-agreement.json', import.meta.url), 'utf8'));
export function agreementNotes(notes) {
  if (!Array.isArray(notes) || notes.some(n => typeof n !== 'string')) throw new Error('INVALID_NOTES');
  return notes.flatMap(n => agreement.unresolvedReplacements[n] ?? [n]);
}
const append = (source, note) => source.includes(note) ? source : `${source}; ${note}`;
export function agreedCourse(course) {
  if (agreement.grading.codes.includes(course.code)) {
    if (!['unknown', agreement.grading.value].includes(course.grading)) throw new Error('GRADING_CONFLICT');
    return { ...course, grading: agreement.grading.value, source: append(course.source, agreement.grading.sourceNote) };
  }
  if (course.code === agreement.algorithm.code) {
    if (course.prerequisite.mode !== 'all' || course.prerequisite.concurrent !== false ||
        stable([...course.prerequisite.courses].sort()) !== stable(agreement.algorithm.requiredPassedCodes))
      throw new Error('PREREQUISITE_CONFLICT');
    if (![null, 'OPEN-03: การเรียนพร้อมสิบสัปดาห์ยังต้องยืนยัน', agreement.algorithm.unresolvedNote].includes(course.prerequisite.unresolved))
      throw new Error('PREREQUISITE_NOTE_CONFLICT');
    return { ...course, prerequisite: { ...course.prerequisite, unresolved: agreement.algorithm.unresolvedNote }, source: append(course.source, agreement.algorithm.sourceNote) };
  }
  return { ...course };
}
export function makeAgreementPlan(datasets, database) {
  return { format: agreement.id, database, createdAt: new Date().toISOString(), datasets: datasets.filter(d => d.status === 'draft').map(d => {
    for (const code of [...agreement.grading.codes, agreement.algorithm.code])
      if (d.courses.filter(c => c.code === code).length !== 1) throw new Error('CATALOG_SCOPE_CHANGED');
    return { ...d, afterUnresolved: agreementNotes(d.unresolved), changes: d.courses.flatMap(c => {
      const after = agreedCourse(c);
      if (stable(c) === stable(after)) return [];
      const fields = x => ({ grading: x.grading, prerequisite: x.prerequisite, source: x.source });
      return [{ code: c.code, before: fields(c), after: fields(after) }];
    }) };
  }) };
}
const state = (d, after) => d.courses.map(c => ({ ...c, ...(d.changes.find(x => x.code === c.code)?.[after ? 'after' : 'before'] ?? {}) })).sort((a, b) => a.code.localeCompare(b.code));
export async function applyAgreement(client, plan, rollback = false) {
  if (plan.format !== agreement.id || !Array.isArray(plan.datasets)) throw new Error('INVALID_PLAN');
  const result = [];
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
  try {
    for (const d of [...plan.datasets].sort((a, b) => a.id.localeCompare(b.id))) {
      if (stable(d.afterUnresolved) !== stable(agreementNotes(d.unresolved))) throw new Error('INVALID_PLAN');
      const live = (await client.query(`SELECT d.id,d.version,d."editVersion",d.status,d.source,d.policy,d.groups,d.unresolved
        FROM "AcademicDataset" d JOIN "CurriculumVersion" v ON v.id=d."curriculumVersionId"
        JOIN "Curriculum" c ON c.id=v."curriculumId" WHERE d.id=$1 AND c.code='CS2565' FOR UPDATE OF d`, [d.id])).rows[0];
      if (!live || live.status !== 'draft') throw new Error('DRAFT_CONFLICT');
      for (const key of ['version', 'source', 'policy', 'groups'])
        if (stable(live[key]) !== stable(d[key])) throw new Error('DATASET_CONFLICT');
      const current = (await client.query(`SELECT ${courseColumns} FROM "CatalogCourse" WHERE "datasetId"=$1 ORDER BY code FOR UPDATE`, [d.id])).rows;
      const before = state(d, false), after = state(d, true);
      const changed = d.changes.length > 0 || stable(d.unresolved) !== stable(d.afterUnresolved);
      if (!rollback && changed && live.editVersion === d.editVersion + 1 && stable(current) === stable(after) && stable(live.unresolved) === stable(d.afterUnresolved)) {
        result.push({ version: live.version, changedCourses: 0, alreadyApplied: true }); continue;
      }
      const expectedVersion = d.editVersion + (rollback && changed ? 1 : 0);
      if (live.editVersion !== expectedVersion || stable(current) !== stable(rollback ? after : before) ||
          stable(live.unresolved) !== stable(rollback ? d.afterUnresolved : d.unresolved)) throw new Error('AGREEMENT_CONFLICT');
      for (const change of d.changes) {
        if (![...agreement.grading.codes, agreement.algorithm.code].includes(change.code)) throw new Error('CATALOG_SCOPE_CHANGED');
        const replacement = rollback ? change.before : change.after;
        if (!rollback) {
          const expectedAfter = agreedCourse(d.courses.find(c => c.code === change.code));
          if (stable(replacement) !== stable({ grading: expectedAfter.grading, prerequisite: expectedAfter.prerequisite, source: expectedAfter.source })) throw new Error('INVALID_PLAN');
        }
        const update = await client.query(`UPDATE "CatalogCourse" SET grading=$1,prerequisite=$2,source=$3 WHERE "datasetId"=$4 AND code=$5`, [replacement.grading, JSON.stringify(replacement.prerequisite), replacement.source, d.id, change.code]);
        if (update.rowCount !== 1) throw new Error('AGREEMENT_CONFLICT');
      }
      if (changed) {
        const update = await client.query(`UPDATE "AcademicDataset" SET unresolved=$1,"editVersion"="editVersion"+1 WHERE id=$2 AND status='draft' AND "editVersion"=$3`, [JSON.stringify(rollback ? d.unresolved : d.afterUnresolved), d.id, expectedVersion]);
        if (update.rowCount !== 1) throw new Error('DRAFT_CONFLICT');
      }
      result.push({ version: live.version, changedCourses: d.changes.length, alreadyApplied: false });
    }
    await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

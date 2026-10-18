import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { courseColumns, stable } from './catalog-name-correction.mjs';
export const categoryAgreement = JSON.parse(readFileSync(new URL('../../src/modules/curriculum/data/cs2565-academic-agreement.json', import.meta.url), 'utf8')).categoryAgreement;
const sorted = rows => [...rows].sort((a,b) => a.code.localeCompare(b.code));
const notes = rows => rows.flatMap(n => categoryAgreement.unresolvedReplacements[n] ?? [n]);
export function makeCategoryPlan(datasets, database) {
  return { format: categoryAgreement.id, database, createdAt: new Date().toISOString(), datasets: datasets.filter(d => d.status === 'draft').map(d => {
    for (const code of categoryAgreement.group5Codes)
      if (!d.courses.some(c => c.code === code && c.category === 'specific_elective' && c.credits === 3 && c.specific)) throw new Error('GROUP_FIVE_CONFLICT');
    const existing = d.courses.find(c => c.code === categoryAgreement.newCourse.code);
    if (existing && stable(existing) !== stable(categoryAgreement.newCourse)) throw new Error('COURSE_CONFLICT');
    return { ...d, offerings: d.offerings ?? [], newCourseId: existing ? null : randomUUID(), afterUnresolved: notes(d.unresolved), afterCourses: sorted(existing ? d.courses : [...d.courses, categoryAgreement.newCourse]) };
  }) };
}
export async function applyCategoryAgreement(client, plan, rollback = false) {
  if (plan.format !== categoryAgreement.id || !Array.isArray(plan.datasets)) throw new Error('INVALID_PLAN');
  const result = [];
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
  try {
    for (const d of [...plan.datasets].sort((a,b) => a.id.localeCompare(b.id))) {
      const expected = makeCategoryPlan([{ ...d, status: 'draft' }], plan.database).datasets[0];
      if (stable(expected.afterCourses) !== stable(d.afterCourses) || stable(notes(d.unresolved)) !== stable(d.afterUnresolved) || Boolean(expected.newCourseId) !== Boolean(d.newCourseId)) throw new Error('INVALID_PLAN');
      const live = (await client.query(`SELECT d.id,d.version,d."editVersion",d.status,d.source,d.policy,d.groups,d.unresolved
        FROM "AcademicDataset" d JOIN "CurriculumVersion" v ON v.id=d."curriculumVersionId"
        JOIN "Curriculum" c ON c.id=v."curriculumId" WHERE d.id=$1 AND c.code='CS2565' FOR UPDATE OF d`, [d.id])).rows[0];
      if (!live || live.status !== 'draft') throw new Error('DRAFT_CONFLICT');
      for (const key of ['version','source','policy','groups'])
        if (stable(live[key]) !== stable(d[key])) throw new Error('DATASET_CONFLICT');
      const current = (await client.query(`SELECT ${courseColumns} FROM "CatalogCourse" WHERE "datasetId"=$1 ORDER BY code FOR UPDATE`, [d.id])).rows;
      const offerings = (await client.query('SELECT * FROM "CourseOffering" WHERE "datasetId"=$1 ORDER BY "courseCode",year,semester FOR UPDATE', [d.id])).rows;
      if (stable(offerings) !== stable(d.offerings)) throw new Error('OFFERING_CONFLICT');
      const changed = Boolean(d.newCourseId) || stable(d.unresolved) !== stable(d.afterUnresolved);
      const matches = after => stable(current) === stable(after ? d.afterCourses : sorted(d.courses)) && stable(live.unresolved) === stable(after ? d.afterUnresolved : d.unresolved);
      if (!rollback && changed && live.editVersion === d.editVersion + 1 && matches(true)) {
        result.push({ version: d.version, insertedCourses: 0, alreadyApplied: true }); continue;
      }
      const expectedVersion = d.editVersion + (rollback && changed ? 1 : 0);
      if (live.editVersion !== expectedVersion || !matches(rollback)) throw new Error('CATEGORY_SNAPSHOT_CONFLICT');
      if (d.newCourseId) {
        const c = categoryAgreement.newCourse;
        if (rollback) {
          const removed = await client.query('DELETE FROM "CatalogCourse" WHERE id=$1 AND "datasetId"=$2 AND code=$3', [d.newCourseId, d.id, c.code]);
          if (removed.rowCount !== 1) throw new Error('COURSE_CONFLICT');
        } else {
          await client.query(`INSERT INTO "CatalogCourse" (id,"datasetId",code,name,credits,category,tracks,grading,specific,prerequisite,"requiresConsent",source)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [d.newCourseId,d.id,c.code,c.name,c.credits,c.category,c.tracks,c.grading,c.specific,JSON.stringify(c.prerequisite),c.requiresConsent,c.source]);
        }
      }
      if (changed) {
        const update = await client.query(`UPDATE "AcademicDataset" SET unresolved=$1,"editVersion"="editVersion"+1 WHERE id=$2 AND status='draft' AND "editVersion"=$3`, [JSON.stringify(rollback ? d.unresolved : d.afterUnresolved),d.id,expectedVersion]);
        if (update.rowCount !== 1) throw new Error('DRAFT_CONFLICT');
      }
      result.push({ version: d.version, insertedCourses: d.newCourseId ? (rollback ? -1 : 1) : 0, alreadyApplied: false });
    }
    await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

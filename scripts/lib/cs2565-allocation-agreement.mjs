import { agreement } from './cs2565-academic-agreement.mjs';
import { courseColumns, stable } from './catalog-name-correction.mjs';

const agreementNotes = notes => notes.flatMap(n => agreement.allocationAgreement.unresolvedReplacements[n] ?? [n]);
const format = 'cs2565-allocation-2026-10-17-v1';
export function agreedPolicy(policy) {
  for (const [key, value] of Object.entries(agreement.allocationAgreement.values)) {
    if (policy[key] !== undefined && policy[key] !== 'unconfirmed' && stable(policy[key]) !== stable(value))
      throw new Error('POLICY_CONFLICT');
  }
  const note = agreement.allocationAgreement.sourceNote;
  return { ...policy, ...agreement.allocationAgreement.values,
    source: policy.source.includes(note) ? policy.source : `${policy.source}; ${note}` };
}
export function makeAllocationPlan(datasets, database) {
  return { format, database, createdAt: new Date().toISOString(), datasets: datasets.filter(d => d.status === 'draft').map(d => {
    const foundation = d.courses.find(c => c.code === '511100');
    if (!foundation || foundation.grading !== 'su' || foundation.category !== 'non_degree')
      throw new Error('FOUNDATION_POLICY_CONFLICT');
    return { ...d, afterPolicy: agreedPolicy(d.policy), afterUnresolved: agreementNotes(d.unresolved), changes: [] };
  }) };
}
export async function applyAllocation(client, plan, rollback = false) {
  if (plan.format !== format || !Array.isArray(plan.datasets)) throw new Error('INVALID_PLAN');
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
  try {
    const result = [];
    for (const d of [...plan.datasets].sort((a,b) => a.id.localeCompare(b.id))) {
      if (stable(d.afterPolicy) !== stable(agreedPolicy(d.policy)) || stable(d.afterUnresolved) !== stable(agreementNotes(d.unresolved)))
        throw new Error('INVALID_PLAN');
      const live = (await client.query(`SELECT d.id,d.version,d."editVersion",d.status,d.source,d.policy,d.groups,d.unresolved
        FROM "AcademicDataset" d JOIN "CurriculumVersion" v ON v.id=d."curriculumVersionId"
        JOIN "Curriculum" c ON c.id=v."curriculumId" WHERE d.id=$1 AND c.code='CS2565' FOR UPDATE OF d`, [d.id])).rows[0];
      if (!live || live.status !== 'draft') throw new Error('DRAFT_CONFLICT');
      for (const key of ['version','source','groups'])
        if (stable(live[key]) !== stable(d[key])) throw new Error('DATASET_CONFLICT');
      const courses = (await client.query(`SELECT ${courseColumns} FROM "CatalogCourse" WHERE "datasetId"=$1 ORDER BY code FOR UPDATE`, [d.id])).rows;
      if (stable(courses) !== stable([...d.courses].sort((a,b) => a.code.localeCompare(b.code)))) throw new Error('CATALOG_CONFLICT');
      const changed = stable(d.policy) !== stable(d.afterPolicy) || stable(d.unresolved) !== stable(d.afterUnresolved);
      const matches = after => stable(live.policy) === stable(after ? d.afterPolicy : d.policy) && stable(live.unresolved) === stable(after ? d.afterUnresolved : d.unresolved);
      if (!rollback && changed && live.editVersion === d.editVersion + 1 && matches(true)) {
        result.push({ version: d.version, changedPolicy: false, alreadyApplied: true }); continue;
      }
      const expectedVersion = d.editVersion + (rollback && changed ? 1 : 0);
      if (live.editVersion !== expectedVersion || !matches(rollback)) throw new Error('POLICY_SNAPSHOT_CONFLICT');
      if (changed) {
        const update = await client.query(`UPDATE "AcademicDataset" SET policy=$1,unresolved=$2,"editVersion"="editVersion"+1 WHERE id=$3 AND status='draft' AND "editVersion"=$4`,
          [JSON.stringify(rollback ? d.policy : d.afterPolicy), JSON.stringify(rollback ? d.unresolved : d.afterUnresolved), d.id, expectedVersion]);
        if (update.rowCount !== 1) throw new Error('DRAFT_CONFLICT');
      }
      result.push({ version: d.version, changedPolicy: changed, alreadyApplied: false });
    }
    await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

// Narrow data repair: preserve course IDs and every academic field.
export const courseColumns = `code, name, credits, category, tracks, grading, specific,
  prerequisite, "requiresConsent", source`;
export function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function makeCorrectionPlan(datasets, seed, database) {
  const canonical = new Map(seed.courses.map(c => [c.code, c]));
  return { format: 1, database, createdAt: new Date().toISOString(), datasets: datasets.filter(d => d.status === 'draft').map(d => {
    if (d.courses.length !== canonical.size || d.courses.some(c => !canonical.has(c.code)))
      throw new Error('CATALOG_SCOPE_CHANGED');
    return { ...d, changes: d.courses.flatMap(c => {
      const target = canonical.get(c.code);
      return c.name === target.name && c.source === target.source ? [] :
        [{ code: c.code, before: { name: c.name, source: c.source }, after: { name: target.name, source: target.source } }];
    }) };
  }) };
}
function courseState(dataset, after) {
  const changes = new Map(dataset.changes.map(c => [c.code, c]));
  return dataset.courses.map(c => ({ ...c, ...(changes.has(c.code) ? changes.get(c.code)[after ? 'after' : 'before'] : {}) }))
    .sort((a, b) => a.code.localeCompare(b.code));
}
export async function applyCorrection(client, plan, rollback = false) {
  if (plan.format !== 1 || !Array.isArray(plan.datasets)) throw new Error('INVALID_PLAN');
  const result = [];
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
  try {
    for (const dataset of [...plan.datasets].sort((a, b) => a.id.localeCompare(b.id))) {
      const { rows } = await client.query(`SELECT d.id, d.version, d."editVersion", d.status,
        d.policy, d.groups, d.unresolved, d.source FROM "AcademicDataset" d
        JOIN "CurriculumVersion" v ON v.id=d."curriculumVersionId"
        JOIN "Curriculum" c ON c.id=v."curriculumId"
        WHERE d.id=$1 AND c.code='CS2565' FOR UPDATE OF d`, [dataset.id]);
      const live = rows[0];
      if (!live || live.status !== 'draft') throw new Error('DRAFT_CONFLICT');
      for (const key of ['version', 'source', 'policy', 'groups', 'unresolved'])
        if (stable(live[key]) !== stable(dataset[key])) throw new Error('DATASET_CONFLICT');
      const current = (await client.query(`SELECT ${courseColumns} FROM "CatalogCourse"
        WHERE "datasetId"=$1 ORDER BY code FOR UPDATE`, [dataset.id])).rows;
      const before = courseState(dataset, false), after = courseState(dataset, true);
      const expectedVersion = dataset.editVersion + (rollback && dataset.changes.length ? 1 : 0);
      // Re-applying the identical repair is a no-op; later unrelated edits still conflict.
      if (!rollback && dataset.changes.length && live.editVersion === dataset.editVersion + 1 && stable(current) === stable(after)) {
        result.push({ version: live.version, changed: 0, alreadyApplied: true });
        continue;
      }
      if (live.editVersion !== expectedVersion || stable(current) !== stable(rollback ? after : before))
        throw new Error('COURSE_CONFLICT');
      for (const change of dataset.changes) {
        const expected = rollback ? change.after : change.before;
        const replacement = rollback ? change.before : change.after;
        const update = await client.query(`UPDATE "CatalogCourse" SET name=$1, source=$2
          WHERE "datasetId"=$3 AND code=$4 AND name=$5 AND source=$6`,
        [replacement.name, replacement.source, dataset.id, change.code, expected.name, expected.source]);
        if (update.rowCount !== 1) throw new Error('COURSE_CONFLICT');
      }
      if (dataset.changes.length) {
        const update = await client.query(`UPDATE "AcademicDataset" SET "editVersion"="editVersion"+1
          WHERE id=$1 AND status='draft' AND "editVersion"=$2`, [dataset.id, expectedVersion]);
        if (update.rowCount !== 1) throw new Error('DRAFT_CONFLICT');
      }
      result.push({ version: live.version, changed: dataset.changes.length, alreadyApplied: false });
    }
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

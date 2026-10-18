import { applyAllocation, makeAllocationPlan } from "../../scripts/lib/cs2565-allocation-agreement.mjs";
import { applyCategoryAgreement, makeCategoryPlan } from "../../scripts/lib/cs2565-category-agreement.mjs";
import { applyGradePolicy, makeGradePolicyPlan } from "../../scripts/lib/cs2565-grade-policy.mjs";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { beforeAll, afterAll, afterEach, describe, it, expect } from "vitest";
import { assertTestDatabase, ensureMetadata } from "../support/fixtures";
import seed from "@/modules/curriculum/data/cs2565.json";
import { applyCorrection, makeCorrectionPlan, courseColumns, stable } from "../../scripts/lib/catalog-name-correction.mjs";
import { applyAgreement, makeAgreementPlan } from "../../scripts/lib/cs2565-academic-agreement.mjs";

const client = new Client({ connectionString: process.env.DATABASE_URL });
const ids: string[] = [];
let curriculumVersionId: string;
beforeAll(async () => {
  assertTestDatabase();
  curriculumVersionId = (await ensureMetadata()).version.id;
  await client.connect();
});

async function agreementDraft() {
  const d = await draft();
  await client.query('UPDATE "CatalogCourse" SET grading=\'unknown\' WHERE "datasetId"=$1 AND code IN (\'517392\',\'517393\')', [d.id]);
  await client.query(`UPDATE "CatalogCourse" SET prerequisite=jsonb_set(prerequisite::jsonb,'{unresolved}',to_jsonb($2::text)) WHERE "datasetId"=$1 AND code='517311'`, [d.id, "OPEN-03: การเรียนพร้อมสิบสัปดาห์ยังต้องยืนยัน"]);
  d.unresolved = ["OPEN-03/04/10: เงื่อนไขโครงงานและสหกิจ", "OPEN-05/16: S*/U* และนโยบายรายวิชา", "Unrelated pending policy"];
  await client.query('UPDATE "AcademicDataset" SET unresolved=$1 WHERE id=$2', [JSON.stringify(d.unresolved), d.id]);
  d.courses = (await client.query(`SELECT ${courseColumns} FROM "CatalogCourse" WHERE "datasetId"=$1 ORDER BY code`, [d.id])).rows;
  return d;
}
describe("academic agreement repair", () => {
  it("updates three courses only, preserves IDs, re-applies safely and rolls back exactly", async () => {
    const d = await agreementDraft();
    const before = (await client.query('SELECT * FROM "CatalogCourse" WHERE "datasetId"=$1 ORDER BY code', [d.id])).rows;
    const plan = makeAgreementPlan([d], "aps_v2_test");
    expect((await applyAgreement(client, plan))[0].changedCourses).toBe(3);
    const after = (await client.query('SELECT * FROM "CatalogCourse" WHERE "datasetId"=$1 ORDER BY code', [d.id])).rows;
    expect(after.map(c => c.id)).toEqual(before.map(c => c.id));
    for (const [i, row] of after.entries()) {
      if (!["517311", "517392", "517393"].includes(row.code)) expect(row).toEqual(before[i]);
      expect(row.name).toBe(before[i].name);
      expect(row.credits).toBe(before[i].credits);
      expect(row.category).toBe(before[i].category);
      expect(row.tracks).toEqual(before[i].tracks);
    }
    for (const code of ["517392", "517393"]) expect(after.find(c => c.code === code).grading).toBe("su");
    expect((await applyAgreement(client, plan))[0].alreadyApplied).toBe(true);
    const afterSnapshot = { ...d, editVersion: d.editVersion + 1, courses: (await client.query(`SELECT ${courseColumns} FROM "CatalogCourse" WHERE "datasetId"=$1 ORDER BY code`, [d.id])).rows, unresolved: plan.datasets[0].afterUnresolved };
    expect(makeAgreementPlan([afterSnapshot], "aps_v2_test").datasets[0].changes).toHaveLength(0);
    await applyAgreement(client, plan, true);
    expect((await client.query('SELECT * FROM "CatalogCourse" WHERE "datasetId"=$1 ORDER BY code', [d.id])).rows).toEqual(before);
    expect((await client.query('SELECT unresolved FROM "AcademicDataset" WHERE id=$1', [d.id])).rows[0].unresolved).toEqual(d.unresolved);
  });
  it("rolls back earlier updates when the next draft conflicts", async () => {
    const datasets = [await agreementDraft(), await agreementDraft()].sort((a, b) => a.id.localeCompare(b.id));
    const plan = makeAgreementPlan(datasets, "aps_v2_test");
    await client.query('UPDATE "AcademicDataset" SET "editVersion"="editVersion"+1 WHERE id=$1', [datasets[1].id]);
    await expect(applyAgreement(client, plan)).rejects.toThrow("AGREEMENT_CONFLICT");
    expect((await client.query('SELECT grading FROM "CatalogCourse" WHERE "datasetId"=$1 AND code=\'517392\'', [datasets[0].id])).rows[0].grading).toBe("unknown");
  });
  it("refuses published drafts, unrelated changed data and unapproved prerequisite rules", async () => {
    const d = await agreementDraft();
    const plan = makeAgreementPlan([d], "aps_v2_test");
    await client.query('UPDATE "AcademicDataset" SET status=\'published\' WHERE id=$1', [d.id]);
    await expect(applyAgreement(client, plan)).rejects.toThrow("DRAFT_CONFLICT");
    expect(makeAgreementPlan([{ ...d, status: "published" }], "aps_v2_test").datasets).toHaveLength(0);
    await client.query('UPDATE "AcademicDataset" SET status=\'draft\' WHERE id=$1', [d.id]);
    await client.query('UPDATE "CatalogCourse" SET name=\'Keep administrator edit\' WHERE "datasetId"=$1 AND code=\'SU115\'', [d.id]);
    await expect(applyAgreement(client, plan)).rejects.toThrow("AGREEMENT_CONFLICT");
    const changed = structuredClone(d);
    changed.courses.find((c: { code: string }) => c.code === "517311").prerequisite.concurrent = true;
    expect(() => makeAgreementPlan([changed], "aps_v2_test")).toThrow("PREREQUISITE_CONFLICT");
  });
});
afterEach(async () => {
  for (const id of ids.splice(0)) {
    await client.query('DELETE FROM "CatalogCourse" WHERE "datasetId"=$1', [id]);
    await client.query('DELETE FROM "AcademicDataset" WHERE id=$1', [id]);
  }
});
afterAll(() => client.end());
async function draft(status = "draft") {
  const id = randomUUID(); ids.push(id);
  await client.query(`INSERT INTO "AcademicDataset" (id,"curriculumVersionId",version,status,source,policy,groups,unresolved)
    VALUES ($1,$2,$3,$4,'name correction fixture',$5,$6,'[]')`,
  [id, curriculumVersionId, 800000 + Math.floor(Math.random() * 100000), status, JSON.stringify(seed.policy), JSON.stringify(seed.groups)]);
  for (const c of seed.courses.filter(c => c.code !== "517465"))
    await client.query(`INSERT INTO "CatalogCourse" (id,"datasetId",code,name,credits,category,tracks,grading,specific,prerequisite,"requiresConsent",source)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [randomUUID(), id, c.code, `Synthetic old ${c.code}`, c.credits, c.category, c.tracks, c.grading, c.specific, JSON.stringify(c.prerequisite), c.requiresConsent, 'old source']);
  const dataset = (await client.query('SELECT id,version,"editVersion",status,source,policy,groups,unresolved FROM "AcademicDataset" WHERE id=$1', [id])).rows[0];
  dataset.courses = (await client.query(`SELECT ${courseColumns} FROM "CatalogCourse" WHERE "datasetId"=$1 ORDER BY code`, [id])).rows;
  return dataset;
}
describe("catalog name repair transactions", () => {
  it("updates names without replacing IDs or academic fields; reapply is a no-op; rollback restores names", async () => {
    const d = await draft();
    const before = (await client.query('SELECT * FROM "CatalogCourse" WHERE "datasetId"=$1 ORDER BY code', [d.id])).rows;
    const plan = makeCorrectionPlan([d], { courses: seed.courses.filter(c => c.code !== "517465") }, "aps_v2_test");
    expect((await applyCorrection(client, plan))[0].changed).toBe(188);
    const after = (await client.query('SELECT * FROM "CatalogCourse" WHERE "datasetId"=$1 ORDER BY code', [d.id])).rows;
    const academic = (rows: Record<string, unknown>[]) => rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "name" && key !== "source")));
    expect(stable(academic(after))).toBe(stable(academic(before)));
    expect((await applyCorrection(client, plan))[0].alreadyApplied).toBe(true);
    await applyCorrection(client, plan, true);
    expect((await client.query('SELECT * FROM "CatalogCourse" WHERE "datasetId"=$1 ORDER BY code', [d.id])).rows).toEqual(before);
  });
  it("rolls back all earlier datasets when a later dataset conflicts", async () => {
    const datasets = [await draft(), await draft()].sort((a, b) => a.id.localeCompare(b.id));
    const plan = makeCorrectionPlan(datasets, { courses: seed.courses.filter(c => c.code !== "517465") }, "aps_v2_test");
    await client.query('UPDATE "AcademicDataset" SET "editVersion"="editVersion"+1 WHERE id=$1', [datasets[1].id]);
    await expect(applyCorrection(client, plan)).rejects.toThrow("COURSE_CONFLICT");
    const first = (await client.query('SELECT name FROM "CatalogCourse" WHERE "datasetId"=$1 ORDER BY code LIMIT 1', [datasets[0].id])).rows[0];
    expect(first.name).toMatch(/^Synthetic old /);
  });
  it("refuses a published draft and never overwrites later administrator changes", async () => {
    const d = await draft();
    const plan = makeCorrectionPlan([d], { courses: seed.courses.filter(c => c.code !== "517465") }, "aps_v2_test");
    await client.query('UPDATE "AcademicDataset" SET status=\'published\' WHERE id=$1', [d.id]);
    await expect(applyCorrection(client, plan)).rejects.toThrow("DRAFT_CONFLICT");
    expect(makeCorrectionPlan([{ ...d, status: "published" }], { courses: seed.courses.filter(c => c.code !== "517465") }, "aps_v2_test").datasets).toHaveLength(0);
    await client.query('UPDATE "AcademicDataset" SET status=\'draft\' WHERE id=$1', [d.id]);
    await applyCorrection(client, plan);
    await client.query('UPDATE "CatalogCourse" SET name=\'Administrator edit\' WHERE "datasetId"=$1 AND code=\'SU115\'', [d.id]);
    await expect(applyCorrection(client, plan, true)).rejects.toThrow("COURSE_CONFLICT");
    expect((await client.query('SELECT name FROM "CatalogCourse" WHERE "datasetId"=$1 AND code=\'SU115\'', [d.id])).rows[0].name).toBe("Administrator edit");
  });
});

async function legacyGradeDraft() {
  const d = await draft();
  d.policy = { ...seed.policy, repeat: "unconfirmed", rounding: "unconfirmed", prerequisitePass: "unconfirmed", source: "Legacy policy" };
  delete d.policy.starGradeCourses; delete d.policy.gpaComparison; delete d.policy.specificGpaBasis;
  d.unresolved = ["OPEN-05: ความหมาย S*/U* ยังต้องยืนยัน", "OPEN-06/07: เรียนซ้ำและปัดเกรด", "Unrelated pending rule"];
  await client.query('UPDATE "AcademicDataset" SET policy=$1,unresolved=$2 WHERE id=$3', [JSON.stringify(d.policy), JSON.stringify(d.unresolved), d.id]);
  return d;
}
describe("grade policy repair transactions", () => {
  it("changes policy only, is idempotent and rolls back without touching courses", async () => {
    const d = await legacyGradeDraft(), plan = makeGradePolicyPlan([d], "aps_v2_test");
    const courses = (await client.query('SELECT * FROM "CatalogCourse" WHERE "datasetId"=$1 ORDER BY code', [d.id])).rows;
    expect((await applyGradePolicy(client, plan))[0].changedPolicy).toBe(true);
    expect((await applyGradePolicy(client, plan))[0].alreadyApplied).toBe(true);
    const after = (await client.query('SELECT policy,unresolved,"editVersion" FROM "AcademicDataset" WHERE id=$1', [d.id])).rows[0];
    expect(after.policy).toEqual(plan.datasets[0].afterPolicy);
    expect(after.unresolved).toContain("Unrelated pending rule");
    const fresh = makeGradePolicyPlan([{ ...d, ...after }], "aps_v2_test");
    expect((await applyGradePolicy(client, fresh))[0].changedPolicy).toBe(false);
    await applyGradePolicy(client, plan, true);
    const restored = (await client.query('SELECT policy,unresolved FROM "AcademicDataset" WHERE id=$1', [d.id])).rows[0];
    expect(restored).toEqual({ policy: d.policy, unresolved: d.unresolved });
    expect((await client.query('SELECT * FROM "CatalogCourse" WHERE "datasetId"=$1 ORDER BY code', [d.id])).rows).toEqual(courses);
  });
  it("aborts all policy writes when a later draft conflicts", async () => {
    const datasets = [await legacyGradeDraft(), await legacyGradeDraft()].sort((a,b) => a.id.localeCompare(b.id));
    const plan = makeGradePolicyPlan(datasets, "aps_v2_test");
    await client.query('UPDATE "AcademicDataset" SET "editVersion"="editVersion"+1 WHERE id=$1', [datasets[1].id]);
    await expect(applyGradePolicy(client, plan)).rejects.toThrow("POLICY_SNAPSHOT_CONFLICT");
    expect((await client.query('SELECT policy FROM "AcademicDataset" WHERE id=$1', [datasets[0].id])).rows[0].policy).toEqual(datasets[0].policy);
  });
  it("protects published datasets and later edits during apply and rollback", async () => {
    const d = await legacyGradeDraft(), plan = makeGradePolicyPlan([d], "aps_v2_test");
    expect(makeGradePolicyPlan([{ ...d, status: "published" }], "aps_v2_test").datasets).toEqual([]);
    await client.query(`UPDATE "AcademicDataset" SET status='published' WHERE id=$1`, [d.id]);
    await expect(applyGradePolicy(client, plan)).rejects.toThrow("DRAFT_CONFLICT");
    await client.query(`UPDATE "AcademicDataset" SET status='draft' WHERE id=$1`, [d.id]);
    await applyGradePolicy(client, plan);
    await client.query('UPDATE "AcademicDataset" SET "editVersion"="editVersion"+1 WHERE id=$1', [d.id]);
    await expect(applyGradePolicy(client, plan, true)).rejects.toThrow("POLICY_SNAPSHOT_CONFLICT");
  });
  it("rejects conflicting policies, altered plans and changed catalogues", async () => {
    const d = await legacyGradeDraft(), plan = makeGradePolicyPlan([d], "aps_v2_test");
    expect(() => makeGradePolicyPlan([{ ...d, policy: { ...d.policy, repeat: "all_attempts" } }], "aps_v2_test")).toThrow("POLICY_CONFLICT");
    const altered = structuredClone(plan); altered.datasets[0].afterPolicy.normalMax = 30;
    await expect(applyGradePolicy(client, altered)).rejects.toThrow("INVALID_PLAN");
    await client.query(`UPDATE "CatalogCourse" SET name='Later edit' WHERE "datasetId"=$1 AND code='511100'`, [d.id]);
    await expect(applyGradePolicy(client, plan)).rejects.toThrow("CATALOG_CONFLICT");
  });
});

describe("category agreement draft update", () => {
  it("inserts only 517465, preserves original course IDs, supports no-op and rollback", async () => {
    const d = await draft(); d.offerings = [];
    const before = (await client.query('SELECT * FROM "CatalogCourse" WHERE "datasetId"=$1 ORDER BY code', [d.id])).rows;
    const plan = makeCategoryPlan([d], "aps_v2_test");
    expect((await applyCategoryAgreement(client, plan))[0].insertedCourses).toBe(1);
    expect((await applyCategoryAgreement(client, plan))[0].alreadyApplied).toBe(true);
    const after = (await client.query('SELECT * FROM "CatalogCourse" WHERE "datasetId"=$1 ORDER BY code', [d.id])).rows;
    expect(after.filter(c => c.code !== "517465")).toEqual(before);
    expect(after.find(c => c.code === "517465")).toMatchObject({ credits: 3, grading: "numeric", category: "specific_elective", specific: true });
    const current = (await client.query('SELECT unresolved,"editVersion" FROM "AcademicDataset" WHERE id=$1', [d.id])).rows[0];
    const fresh = makeCategoryPlan([{ ...d, ...current, courses: (await client.query(`SELECT ${courseColumns} FROM "CatalogCourse" WHERE "datasetId"=$1 ORDER BY code`, [d.id])).rows }], "aps_v2_test");
    expect((await applyCategoryAgreement(client, fresh))[0].insertedCourses).toBe(0);
    await applyCategoryAgreement(client, plan, true);
    expect((await client.query('SELECT * FROM "CatalogCourse" WHERE "datasetId"=$1 ORDER BY code', [d.id])).rows).toEqual(before);
  });
  it("aborts all inserts when a later draft conflicts", async () => {
    const datasets = [await draft(), await draft()].sort((a,b) => a.id.localeCompare(b.id));
    const plan = makeCategoryPlan(datasets, "aps_v2_test");
    await client.query('UPDATE "AcademicDataset" SET "editVersion"="editVersion"+1 WHERE id=$1', [datasets[1].id]);
    await expect(applyCategoryAgreement(client, plan)).rejects.toThrow("CATEGORY_SNAPSHOT_CONFLICT");
    expect((await client.query('SELECT code FROM "CatalogCourse" WHERE "datasetId"=$1 AND code=$2', [datasets[0].id, "517465"])).rows).toEqual([]);
  });
  it("protects published datasets, modified plans, and later edits on rollback", async () => {
    const d = await draft(), plan = makeCategoryPlan([d], "aps_v2_test");
    const tampered = structuredClone(plan); tampered.datasets[0].afterCourses = [];
    await expect(applyCategoryAgreement(client, tampered)).rejects.toThrow("INVALID_PLAN");
    await client.query(`UPDATE "AcademicDataset" SET status='published' WHERE id=$1`, [d.id]);
    await expect(applyCategoryAgreement(client, plan)).rejects.toThrow("DRAFT_CONFLICT");
    expect(makeCategoryPlan([{ ...d, status: "published" }], "aps_v2_test").datasets).toEqual([]);
    await client.query(`UPDATE "AcademicDataset" SET status='draft' WHERE id=$1`, [d.id]);
    await applyCategoryAgreement(client, plan);
    await client.query('UPDATE "AcademicDataset" SET "editVersion"="editVersion"+1 WHERE id=$1', [d.id]);
    await expect(applyCategoryAgreement(client, plan, true)).rejects.toThrow("CATEGORY_SNAPSHOT_CONFLICT");
  });
});

async function allocationDraft() {
  const d = await draft();
  delete d.policy.electiveAllocation;
  d.unresolved = ["OPEN-15: วิธีจัดหมวดและเลือกเสรียังรอข้อตกลง", "Unrelated rule"];
  await client.query('UPDATE "AcademicDataset" SET policy=$1,unresolved=$2 WHERE id=$3', [JSON.stringify(d.policy),JSON.stringify(d.unresolved),d.id]);
  return d;
}
describe("allocation policy draft update", () => {
  it("applies one policy without changing courses, re-applies safely and rolls back", async () => {
    const d = await allocationDraft(), plan = makeAllocationPlan([d], "aps_v2_test");
    expect((await applyAllocation(client,plan))[0].changedPolicy).toBe(true);
    expect((await applyAllocation(client,plan))[0].alreadyApplied).toBe(true);
    const after = (await client.query('SELECT policy,unresolved FROM "AcademicDataset" WHERE id=$1',[d.id])).rows[0];
    expect(after.policy.electiveAllocation).toBe("specific_then_free_earliest_pass");
    expect(after.unresolved).toContain("Unrelated rule");
    expect((await client.query(`SELECT ${courseColumns} FROM "CatalogCourse" WHERE "datasetId"=$1 ORDER BY code`,[d.id])).rows).toEqual(d.courses);
    await applyAllocation(client,plan,true);
    expect((await client.query('SELECT policy,unresolved FROM "AcademicDataset" WHERE id=$1',[d.id])).rows[0]).toEqual({policy:d.policy,unresolved:d.unresolved});
  });
  it("rolls back a whole batch on conflict and refuses a published dataset", async () => {
    const ds = [await allocationDraft(),await allocationDraft()].sort((a,b)=>a.id.localeCompare(b.id));
    const plan = makeAllocationPlan(ds,"aps_v2_test");
    await client.query('UPDATE "AcademicDataset" SET "editVersion"="editVersion"+1 WHERE id=$1',[ds[1].id]);
    await expect(applyAllocation(client,plan)).rejects.toThrow("POLICY_SNAPSHOT_CONFLICT");
    expect((await client.query('SELECT policy FROM "AcademicDataset" WHERE id=$1',[ds[0].id])).rows[0].policy).toEqual(ds[0].policy);
    await client.query(`UPDATE "AcademicDataset" SET status='published' WHERE id=$1`,[ds[0].id]);
    await expect(applyAllocation(client,makeAllocationPlan([ds[0]],"aps_v2_test"))).rejects.toThrow("DRAFT_CONFLICT");
  });
});

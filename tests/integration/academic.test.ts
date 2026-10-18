import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import type { AccountContext } from "@/modules/accounts/types";
import {
  createIdentity,
  createSessionFixture,
  assertTestDatabase,
} from "../support/fixtures";
import { getDatabase } from "@/server/database";
import { requireAccount } from "@/server/account-context";
import {
  createDataset,
  saveDataset,
  publishDataset,
  uploadTranscript,
  getDraft,
  saveDraft,
  confirmDraft,
  cancelDraft,
  reviseTranscript,
  ownDocument,
  runAnalysis,
  runScenario,
  studentWorkspace,
} from "@/server/academic";
import { syntheticTranscript } from "../support/synthetic-transcript";
import { academicDataset } from "../support/academic-fixtures";
import { GET as getDraftRoute } from "@/app/api/student/transcripts/[id]/route";
import { POST as uploadRoute } from "@/app/api/student/transcripts/route";
import { POST as confirmRoute } from "@/app/api/student/transcripts/[id]/confirm/route";
import { POST as analysisRoute } from "@/app/api/student/analysis/route";
import { previewCourseImport } from "@/server/course-import";
import { COURSE_COLUMNS, csvCell } from "@/modules/curriculum/csv";
import ExcelJS from "exceljs";
const database = getDatabase();
let admin: AccountContext,
  a: AccountContext,
  b: AccountContext,
  aHeaders: Headers,
  bHeaders: Headers,
  versionId: string;
const owners: string[] = [],
  userIds: string[] = [],
  datasetIds: string[] = [],
  documentIds: string[] = [];
const parameters = {
  currentTerm: { year: 2569, semester: 1 },
  normalLoad: 6,
  summerLoad: 6,
  horizon: 8,
  targetGrade: "B",
  assumeUnknownOfferings: false,
};
function mutation(headers: Headers) {
  return new Headers([
    ...headers.entries(),
    ["origin", "http://localhost:3101"],
    ["content-type", "application/json"],
  ]);
}
beforeAll(async () => {
  assertTestDatabase();
  for (const role of ["admin", "student", "student"] as const) {
    const identity = await createIdentity(role);
    owners.push(identity.access.id);
    userIds.push(identity.user.id);
    versionId = identity.version.id;
    if (role === "student")
      await database.studentEnrollment.update({
        where: { accountAccessId: identity.access.id },
        data: {
          trackState: "not_selected",
          studentCode: `65${Math.floor(Math.random() * 10_000_000)
            .toString()
            .padStart(7, "0")}`,
        },
      });
    const fixture = await createSessionFixture(identity.user.id),
      context = await requireAccount(fixture.headers);
    if (role === "admin") admin = context;
    else if (!a) {
      a = context;
      aHeaders = fixture.headers;
    } else {
      b = context;
      bHeaders = fixture.headers;
    }
  }
});
afterAll(async () => {
  // Cleanup only this suite's synthetic owners and datasets, preserving every other row.
  await database.simulationScenario.deleteMany({
    where: { ownerAccountId: { in: owners } },
  });
  await database.analysisRun.deleteMany({
    where: { ownerAccountId: { in: owners } },
  });
  await database.studentAcademicState.deleteMany({
    where: { enrollment: { accountAccessId: { in: owners } } },
  });
  await database.transcriptRevision.deleteMany({
    where: { ownerAccountId: { in: owners } },
  });
  await database.transcriptDraft.deleteMany({
    where: { ownerAccountId: { in: owners } },
  });
  await database.privateDocument.deleteMany({
    where: { id: { in: documentIds } },
  });
  await database.academicDataset.deleteMany({
    where: { id: { in: datasetIds } },
  });
  await database.studentEnrollment.deleteMany({
    where: { accountAccessId: { in: owners } },
  });
  await database.curriculumAdmin.deleteMany({
    where: { accountAccessId: { in: owners } },
  });
  await database.enrollmentRequest.deleteMany({where:{accountAccessId:{in:owners}}});
  await database.accountAccess.deleteMany({ where: { id: { in: owners } } });
  await database.user.deleteMany({ where: { id: { in: userIds } } });
});
describe("academic services and HTTP boundaries", () => {
  it("rejects student admin access and grants outside the assigned curriculum", async () => {
    await expect(createDataset(a, versionId)).rejects.toMatchObject({
      status: 403,
    });
    const other = await database.curriculum.create({
      data: {
        code: `SYN-${randomUUID()}`,
        name: "Synthetic isolated curriculum",
        versions: { create: { code: `SYN-${randomUUID()}` } },
      },
      include: { versions: true },
    });
    try {
      await expect(
        createDataset(admin, other.versions[0].id),
      ).rejects.toMatchObject({ status: 403 });
    } finally {
      await database.curriculumVersion.deleteMany({
        where: { curriculumId: other.id },
      });
      await database.curriculum.delete({ where: { id: other.id } });
    }
  });
  it("creates a CS draft without publishing and validates stale edits", async () => {
    const draft = await createDataset(admin, versionId);
    datasetIds.push(draft.id);
    expect(draft.status).toBe("draft");
    expect(draft.courses.length).toBeGreaterThan(100);
    const data = academicDataset(draft);
    const saved = await saveDataset(admin, draft.id, {
      expectedVersion: draft.editVersion,
      dataset: data,
    });
    await expect(
      saveDataset(admin, draft.id, {
        expectedVersion: draft.editVersion,
        dataset: data,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      publishDataset(admin, draft.id, draft.editVersion),
    ).rejects.toMatchObject({ status: 409 });
    const published = await publishDataset(admin, draft.id, saved.editVersion);
    expect(published.published).toBe(true);
    await expect(
      saveDataset(admin, draft.id, {
        expectedVersion: saved.editVersion + 1,
        dataset: data,
      }),
    ).rejects.toMatchObject({ code: "DATASET_IMMUTABLE" });
  });
  it("reads a real synthetic PDF through HTTP, retains the extracted snapshot and checks ownership", async () => {
    const form = new FormData();
    form.set(
      "file",
      new File(
        [new Uint8Array(syntheticTranscript(a.enrollment!.studentCode))],
        "synthetic.pdf",
        { type: "application/pdf" },
      ),
    );
    const headers = new Headers(aHeaders);
    headers.set("origin", "http://localhost:3101");
    const response = await uploadRoute(
      new Request("http://localhost:3101/api/student/transcripts", {
        method: "POST",
        headers,
        body: form,
      }),
    );
    expect(response.status).toBe(201);
    const draft = await response.json();
    documentIds.push(draft.documentId);
    expect(draft.attempts).toHaveLength(1);
    expect(
      draft.issues.filter(
        (i: { severity: string }) => i.severity === "blocking",
      ),
    ).toEqual([]);
    const wrong = await getDraftRoute(
      new Request(`http://localhost:3101/api/student/transcripts/${draft.id}`, {
        headers: bHeaders,
      }),
      { params: Promise.resolve({ id: draft.id }) },
    );
    expect(wrong.status).toBe(404);
    await expect(ownDocument(b, draft.documentId)).rejects.toMatchObject({
      status: 404,
    });
    const stored = await database.transcriptDraft.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(stored.extracted).toHaveProperty("header");
  });
  it("blocks foreign identity and draft data until reconciled against the document", async () => {
    const draft = await uploadTranscript(
      a,
      new Uint8Array(syntheticTranscript(b.enrollment!.studentCode)),
    );
    documentIds.push(draft.documentId);
    expect(draft.issues.some((i) => i.code === "STUDENT_ID_MISMATCH")).toBe(
      true,
    );
    await expect(
      confirmDraft(a, draft.id, draft.editVersion),
    ).rejects.toMatchObject({ code: "TRANSCRIPT_REVIEW_REQUIRED" });
    await cancelDraft(a, draft.id, draft.editVersion);
  });
  it("rejects stale draft edits, confirms concurrently once, and reopens the same confirmed revision", async () => {
    const workspace = await studentWorkspace(a),
      draft = workspace.drafts[0];
    const payload = {
      ...draft,
      attempts: draft.attempts.map((row) => ({
        ...row,
        name: "Corrected Synthetic Course",
      })),
    };
    const saved = await saveDraft(a, draft.id, {
      expectedVersion: draft.editVersion,
      payload,
    });
    await expect(
      saveDraft(a, draft.id, { expectedVersion: draft.editVersion, payload }),
    ).rejects.toMatchObject({ status: 409 });
    const results = await Promise.all([
      confirmDraft(a, draft.id, saved.editVersion),
      confirmDraft(a, draft.id, saved.editVersion),
    ]);
    expect(results[0].revisionId).toBe(results[1].revisionId);
    expect(
      await database.transcriptRevision.count({ where: { draftId: draft.id } }),
    ).toBe(1);
    const request = new Request(
      `http://localhost:3101/api/student/transcripts/${draft.id}/confirm`,
      {
        method: "POST",
        headers: mutation(aHeaders),
        body: JSON.stringify({ expectedVersion: saved.editVersion }),
      },
    );
    expect(
      (
        await confirmRoute(request, {
          params: Promise.resolve({ id: draft.id }),
        })
      ).status,
    ).toBe(200);
    expect((await studentWorkspace(a)).revision?.payload.attempts[0].name).toBe(
      "Corrected Synthetic Course",
    );
    const stored = await database.transcriptDraft.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(
      (stored.extracted as { attempts: { name: string }[] }).attempts[0].name,
    ).not.toBe("Corrected Synthetic Course");
  });
  it("keeps the actual revision while editing/cancelling, rejects two drafts based on the same revision", async () => {
    const actual = (await studentWorkspace(a)).revision!.id;
    const cancelled = await reviseTranscript(a);
    await cancelDraft(a, cancelled.id, cancelled.editVersion);
    expect((await studentWorkspace(a)).revision!.id).toBe(actual);
    const one = await reviseTranscript(a),
      two = await reviseTranscript(a);
    await confirmDraft(a, one.id, one.editVersion);
    await expect(
      confirmDraft(a, two.id, two.editVersion),
    ).rejects.toMatchObject({ status: 409 });
    await cancelDraft(a, two.id, two.editVersion);
  });
  it("analyses a confirmed revision and creates both alternatives without changing enrollment", async () => {
    const output = await runAnalysis(a, parameters);
    expect(output.result.plans.map((p) => p.track)).toEqual([
      "project",
      "cooperative",
    ]);
    expect(output.result.audits[0].gpax.value).toBe(3);
    expect(output.result.plans[0].terms[0].courses[0].code).toBe("101002");
    expect(output.result.plans[0].terms[1].courses[0].code).toBe("101003");
    expect(
      (
        await database.studentEnrollment.findUniqueOrThrow({
          where: { id: a.enrollment!.id },
        })
      ).trackState,
    ).toBe("not_selected");
    const badOrigin = await analysisRoute(
      new Request("http://localhost:3101/api/student/analysis", {
        method: "POST",
        headers: new Headers([
          ...aHeaders.entries(),
          ["origin", "https://untrusted.invalid"],
          ["content-type", "application/json"],
        ]),
        body: JSON.stringify(parameters),
      }),
    );
    expect(badOrigin.status).toBe(403);
  });
  it("persists comparisons with the same snapshot and leaves actual GPA and rows unchanged", async () => {
    const before = (await studentWorkspace(a)).revision!,
      analysis = (await studentWorkspace(a)).analysis!;
    const output = await runScenario(a, {
      analysisId: analysis.id,
      track: "project",
      events: [
        {
          action: "drop",
          courseCode: "101002",
          term: parameters.currentTerm,
          grade: null,
        },
      ],
    });
    expect(output.comparison.termDifference).toBe(1);
    expect((await studentWorkspace(a)).revision).toEqual(before);
    await expect(
      runScenario(b, { analysisId: analysis.id, track: "project", events: [] }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("marks old results stale after confirming a new revision", async () => {
    const draft = await reviseTranscript(a);
    await confirmDraft(a, draft.id, draft.editVersion);
    expect((await studentWorkspace(a)).analysis?.stale).toBe(true);
    expect((await getDraft(a, draft.id)).status).toBe("confirmed");
  });
  it("requires recalculation after an engine version change", async () => {
    const analysis = (await studentWorkspace(a)).analysis!;
    const row = await database.analysisRun.findUniqueOrThrow({
      where: { id: analysis.id },
    });
    try {
      await database.analysisRun.update({
        where: { id: analysis.id },
        data: { engineVersion: "previous-engine" },
      });
      expect((await studentWorkspace(a)).analysis?.stale).toBe(true);
      await expect(
        runScenario(a, {
          analysisId: analysis.id,
          track: "project",
          events: [],
        }),
      ).rejects.toMatchObject({ status: 409, code: "ENGINE_UPDATED" });
    } finally {
      await database.analysisRun.update({
        where: { id: analysis.id },
        data: { engineVersion: row.engineVersion },
      });
    }
  });
  it("CSV/Excel preview catches duplicates and never auto-saves or publishes", async () => {
    const row = [
      "101010",
      "Import Course",
      3,
      "specific_required",
      "",
      "numeric",
      true,
      "all",
      "",
      false,
      false,
      "Synthetic source",
    ]
      .map(csvCell)
      .join(",");
    const text = COURSE_COLUMNS.join(",") + "\n" + row + "\n" + row;
    const preview = await previewCourseImport(
      new TextEncoder().encode(text),
      "csv",
    );
    expect(preview.valid).toBe(false);
    expect(preview.rows[1].error).toContain("ซ้ำ");
    const workbook = new ExcelJS.Workbook(),
      sheet = workbook.addWorksheet("Courses");
    sheet.addRow(COURSE_COLUMNS);
    sheet.addRow([
      "101010",
      "Import Course",
      3,
      "specific_required",
      "",
      "numeric",
      true,
      "all",
      "",
      false,
      false,
      "Synthetic source",
    ]);
    const buffer = await workbook.xlsx.writeBuffer();
    expect(
      (await previewCourseImport(new Uint8Array(buffer), "xlsx")).valid,
    ).toBe(true);
    sheet.getCell("C2").value = { formula: "1+2", result: 3 };
    const formulas = await workbook.xlsx.writeBuffer();
    await expect(
      previewCourseImport(new Uint8Array(formulas), "xlsx"),
    ).rejects.toMatchObject({ code: "IMPORT_FORMULA" });
  });
});

it("first upload belongs to its account; confirming creates one self-confirmed profile and preserves existing owners", async () => {
  const newcomer = await createIdentity("student");
  owners.push(newcomer.access.id); userIds.push(newcomer.user.id);
  await database.studentEnrollment.delete({where:{accountAccessId:newcomer.access.id}});
  const session=await createSessionFixture(newcomer.user.id);
  const context=await requireAccount(session.headers);
  expect(context.enrollment).toBeNull();
  const code="659"+Math.floor(Math.random()*10000000).toString().padStart(7,"0");
  const draft=await uploadTranscript(context,syntheticTranscript(code)); documentIds.push(draft.documentId);
  expect((await studentWorkspace(context)).drafts.map(d=>d.id)).toContain(draft.id);
  expect((await ownDocument(context,draft.documentId)).ownerAccountId).toBe(context.accountId);
  await expect(getDraft(b,draft.id)).rejects.toMatchObject({status:404});
  const results=await Promise.all([confirmDraft(context,draft.id,draft.editVersion),confirmDraft(context,draft.id,draft.editVersion)]);
  expect(results[0].revisionId).toBe(results[1].revisionId);
  const refreshed=await requireAccount(session.headers);
  expect(refreshed.enrollment?.studentCode).toBe(code);
  expect(refreshed.enrollment?.confirmationSource).toBe("student_confirmed");
  expect(await database.transcriptRevision.count({where:{ownerAccountId:context.accountId}})).toBe(1);
  // A second document must not silently change a profile already created.
  const conflicting=await uploadTranscript(context,syntheticTranscript(code+"1")); documentIds.push(conflicting.documentId);
  await expect(confirmDraft(context,conflicting.id,conflicting.editVersion)).rejects.toMatchObject({code:"STUDENT_PROFILE_CONFLICT"});
  const another=await createIdentity("student"); owners.push(another.access.id); userIds.push(another.user.id);
  await database.studentEnrollment.delete({where:{accountAccessId:another.access.id}});
  const anotherSession=await createSessionFixture(another.user.id), other=await requireAccount(anotherSession.headers);
  const duplicate=await uploadTranscript(other,syntheticTranscript(code)); documentIds.push(duplicate.documentId);
  await expect(confirmDraft(other,duplicate.id,duplicate.editVersion)).rejects.toMatchObject({code:"ENROLLMENT_CONFLICT"});
  await expect(confirmDraft(other,duplicate.id,duplicate.editVersion)).rejects.toMatchObject({code:"ENROLLMENT_CONFLICT"});
  expect(await database.enrollmentRequest.count({where:{accountAccessId:other.accountId,status:"pending"}})).toBe(1);
  expect(await database.studentEnrollment.findUnique({where:{accountAccessId:other.accountId}})).toBeNull();
  expect((await getDraft(other,duplicate.id)).status).toBe("draft");
  await database.accountAccess.update({where:{id:other.accountId},data:{status:"inactive"}});
  await expect(confirmDraft(other,duplicate.id,duplicate.editVersion)).rejects.toMatchObject({code:"ACCOUNT_INACTIVE"});
  expect((await database.studentEnrollment.findUnique({where:{accountAccessId:context.accountId}}))?.studentCode).toBe(code);
});

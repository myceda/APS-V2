import { describe, expect, it } from "vitest";
import { DEMO_CASES, DEMO_ORIGIN, assertDemoDatabase, demoEnabled, selectCases, validateRun } from "./config";
import { demoCatalogue, demoCriteria, demoTranscript } from "../../../scripts/demo/data";
import { validateDataset } from "../curriculum/validation";
import seed from "../curriculum/data/cs2565.json";
import { transcriptIssues } from "../transcript/validation";
import { completeness } from "../track-criteria/validation";
import { evaluateEligibility } from "../track-criteria/evaluate";

describe("isolated demo configuration and scenarios",()=>{
  it.each([undefined,"","postgresql://u:p@localhost/aps_v2_dev","postgresql://u:p@example.com/aps_v2_test","https://localhost/aps_v2_test","postgresql://u:p@localhost/aps_v2_test_other"])("rejects an unsafe database without echoing its secret (%s)",url=>{
    expect(()=>assertDemoDatabase(url)).toThrow("local aps_v2_test");
  });
  it("only enables the notice on an explicitly isolated demo server",()=>{
    expect(demoEnabled({})).toBe(false);
    expect(demoEnabled({APS_DEMO_MODE:"1",DATABASE_URL:"postgresql://u:p@127.0.0.1/aps_v2_test",BETTER_AUTH_URL:DEMO_ORIGIN})).toBe(true);
    expect(()=>demoEnabled({APS_DEMO_MODE:"1",DATABASE_URL:"postgresql://u:p@localhost/aps_v2_dev"})).toThrow();
    expect(()=>demoEnabled({APS_DEMO_MODE:"1",DATABASE_URL:"postgresql://u:p@localhost/aps_v2_test",BETTER_AUTH_URL:"http://localhost:3000"})).toThrow("3102");
  });
  it("rejects traversal, unsupported cases and duplicate selections",()=>{
    for(const name of ["../dev","","UPPER","a/b","a".repeat(33)])expect(()=>validateRun(name)).toThrow();
    expect(validateRun("round-2")).toBe("round-2");
    expect(selectCases("all")).toEqual([...DEMO_CASES]);
    expect(selectCases("admin,project")).toEqual(["admin","project"]);
    expect(()=>selectCases("admin,admin")).toThrow();expect(()=>selectCases("real-user")).toThrow();
  });
  it("copies every CS2565 course/policy/OPEN unchanged, adding only labelled synthetic offerings",()=>{
    const d=demoCatalogue("demo");
    expect(validateDataset(d)).toEqual([]);expect(d.courses).toEqual(seed.courses);expect(d.groups).toEqual(seed.groups);expect(d.policy).toEqual(seed.policy);expect(d.unresolved).toEqual(seed.unresolved);
    expect(new Set(d.offerings.map(o=>o.availability))).toEqual(new Set(["open","closed","unknown"]));expect(d.offerings.every(o=>o.source.includes("ข้อมูลสาธิต")&&o.confidence==="planned")).toBe(true);
    expect(seed.offerings).toEqual([]);
  });
  it("unknown track stays blocking while I remains a pending warning",()=>{
    expect(transcriptIssues(demoTranscript("unknown-track","6509000003"),null)).toEqual(expect.arrayContaining([expect.objectContaining({code:"TRACK_UNKNOWN",severity:"blocking"})]));
    const issues=transcriptIssues(demoTranscript("insufficient-data","6509000004"),null);
    expect(issues.some(i=>i.severity==="blocking")).toBe(false);expect(issues.some(i=>i.code==="GRADE_PENDING")).toBe(true);
  });
  it.each([
    ["not-selected","project",2565,"preliminary_pass"], ["project","project",2565,"not_met"], ["cooperative","cooperative",2565,"manual_review"], ["insufficient-data","project",2565,"insufficient_data"], ["awaiting-criteria","project",2566,"awaiting_criteria"],
  ] as const)("computes %s/%s for cohort %s as %s using the existing evaluator",(key,track,admissionYear,status)=>{
    const dataset=demoCatalogue("demo"),input=demoCriteria("demo",dataset.id,track);
    expect(completeness(input)).toEqual([]);
    const result=evaluateEligibility({track,curriculumVersionId:"demo",admissionYear,term:{year:2569,semester:1},criteria:[{...input,id:"demo-criteria",version:1,editVersion:1,status:"published",basedOnId:null}],dataset,transcript:demoTranscript(key,"6509000001"),today:"2026-10-18"});
    expect(result.status).toBe(status);expect(result.approval).toBe("not_verified");
  });
});

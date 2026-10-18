import { describe, expect, it } from "vitest";
import seed from "../curriculum/data/cs2565.json";
import type { Dataset, StudyTrack } from "../curriculum/types";
import type { Attempt, TranscriptPayload } from "../transcript/types";
import { auditTranscript, passedForPrerequisites } from "./engine";
import { makePlan } from "../planning/engine";
import { simulate } from "../simulation/engine";

const parameters={currentTerm:{year:2569,semester:1 as const},normalLoad:12,summerLoad:6,horizon:1,targetGrade:"B",assumeUnknownOfferings:false};
function fixture(problem:"latest-credit"|"su-numeric"|"unknown-grading") {
  const data={...structuredClone(seed),id:"round4-regression",curriculumVersionId:"synthetic",version:1,editVersion:1,status:"draft",groups:[],unresolved:[]} as Dataset;
  const first=structuredClone(data.courses.find(c=>c.code==="517101")!);
  const successor={...structuredClone(first),code:"990002",source:"Synthetic successor regression",prerequisite:{mode:"all" as const,courses:[first.code],concurrent:false,unresolved:null}};
  data.courses=[first,successor];data.policy.normalMin=0;data.policy.degreeCredits=6;
  if(problem==="su-numeric")first.grading="su";
  if(problem==="unknown-grading")first.grading="unknown";
  data.offerings=data.courses.map(c=>({courseCode:c.code,...parameters.currentTerm,availability:"open",confidence:"planned",source:"Synthetic regression"}));
  const row=(grade:string,ordinal:number,credits=3):Attempt=>({courseCode:first.code,name:"Synthetic prerequisite",grade,credits,ordinal,gradePoints:null,year:2568,semester:ordinal+1,kind:"semester",sourcePage:1});
  const rows=problem==="latest-credit"?[row("B",0),row("F",1,2)]:[row("B",0)];
  const field={value:"Synthetic",state:"present" as const,sourcePage:1};
  const transcript:TranscriptPayload={header:{studentCode:field,studentName:field,faculty:field,department:field,degree:field,program:field,track:null,trackState:"not_selected"},attempts:rows,summaries:[],pages:1};
  return {data,transcript,first,successor};
}
describe("Round 4: uncertain assessments cannot authorize successors",()=>{
  for(const problem of ["latest-credit","su-numeric","unknown-grading"] as const)for(const track of ["project","cooperative"] as StudyTrack[]) {
    it(`${problem}: blocks eligibility, baseline and What-if for ${track}`,()=>{
      const {data,transcript,first,successor}=fixture(problem),before=structuredClone({data,transcript});
      expect(auditTranscript(transcript,data,track).courses.find(c=>c.code===first.code)?.status).toBe("unknown");
      expect(passedForPrerequisites(transcript.attempts,data).has(first.code)).toBe(false);
      const baseline=makePlan(transcript,data,track,parameters,"actual");
      expect(baseline.terms.flatMap(t=>t.courses).some(c=>c.code===successor.code)).toBe(false);
      const scenario=simulate(transcript,data,track,parameters,[{action:"add",courseCode:successor.code,term:parameters.currentTerm,grade:"B"}]);
      expect(scenario.changed.terms.flatMap(t=>t.courses).some(c=>c.code===successor.code)).toBe(false);
      expect(scenario.changed.blocked.find(c=>c.code===successor.code)?.reasons.join(" ")).toContain(first.code);
      expect({data,transcript}).toEqual(before);
    });
  }
  it("retains W/I behavior and the declared legacy any-pass policy for valid earlier credits",()=>{
    const {data,transcript,first}=fixture("latest-credit");
    transcript.attempts[1].credits=3;transcript.attempts[1].grade="W";
    transcript.attempts.push({...transcript.attempts[1],ordinal:2,year:2569,semester:1,grade:"I"});
    expect(passedForPrerequisites(transcript.attempts,data).has(first.code)).toBe(true);
    transcript.attempts[1].grade="F";transcript.attempts[1].credits=2;data.policy.prerequisitePass="any_pass";
    expect(passedForPrerequisites(transcript.attempts,data).has(first.code)).toBe(true);
  });
});

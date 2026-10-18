import type { Client } from "pg";
import type { CatalogSnapshot, CatalogRow } from "./catalog-name-correction.mjs";
export const agreement: {
  id: string;
  allocationAgreement: { sourceNote: string; values: Partial<import("../../src/modules/curriculum/types").AcademicPolicy>; unresolvedReplacements: Record<string,string[]> };
  gradePolicy: { sourceNote: string; values: Partial<import("../../src/modules/curriculum/types").AcademicPolicy> };
  grading: { codes: string[]; value: string; sourceNote: string };
  algorithm: { code: string; requiredPassedCodes: string[]; unresolvedNote: string; sourceNote: string };
};
export function agreementNotes(notes: string[]): string[];
export function agreedCourse<T extends CatalogRow>(course: T): T;
export interface AgreementPlan {
  format: string;
  database: string;
  createdAt: string;
  datasets: (CatalogSnapshot & {
    afterUnresolved: string[];
    changes: { code: string; before: Record<string, unknown>; after: Record<string, unknown> }[];
  })[];
}
export function makeAgreementPlan(datasets: CatalogSnapshot[], database: string): AgreementPlan;
export function applyAgreement(client: Client, plan: AgreementPlan, rollback?: boolean): Promise<{ version: number; changedCourses: number; alreadyApplied: boolean }[]>;

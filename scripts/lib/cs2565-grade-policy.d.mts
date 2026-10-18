import type { Client } from "pg";
import type { AcademicPolicy } from "../../src/modules/curriculum/types";
import type { CatalogSnapshot } from "./catalog-name-correction.mjs";
export function agreedPolicy(policy: AcademicPolicy): AcademicPolicy;
export interface GradePolicyPlan {
  format: string;
  database: string;
  createdAt: string;
  datasets: (CatalogSnapshot & { afterPolicy: AcademicPolicy; afterUnresolved: string[]; changes: never[] })[];
}
export function makeGradePolicyPlan(datasets: CatalogSnapshot[], database: string): GradePolicyPlan;
export function applyGradePolicy(client: Client, plan: GradePolicyPlan, rollback?: boolean): Promise<{ version: number; changedPolicy: boolean; alreadyApplied: boolean }[]>;

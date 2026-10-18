import type { Client } from "pg";
import type { AcademicPolicy } from "../../src/modules/curriculum/types";
import type { CatalogSnapshot } from "./catalog-name-correction.mjs";
export function agreedPolicy(policy: AcademicPolicy): AcademicPolicy;
export interface AllocationPlan {
  format: string;
  database: string;
  createdAt: string;
  datasets: (CatalogSnapshot & { afterPolicy: AcademicPolicy; afterUnresolved: string[]; changes: never[] })[];
}
export function makeAllocationPlan(datasets: CatalogSnapshot[], database: string): AllocationPlan;
export function applyAllocation(client: Client, plan: AllocationPlan, rollback?: boolean): Promise<{ version: number; changedPolicy: boolean; alreadyApplied: boolean }[]>;

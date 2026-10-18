import type { Client } from "pg";
export interface CatalogRow {
  code: string;
  name: string;
  source: string;
  [key: string]: unknown;
}
export interface CatalogSnapshot {
  id: string;
  version: number;
  editVersion: number;
  status: string;
  source: string;
  policy: unknown;
  groups: unknown;
  unresolved: unknown;
  courses: CatalogRow[];
}
export interface CorrectionPlan {
  format: number;
  database: string;
  createdAt: string;
  datasets: (CatalogSnapshot & {
    changes: {
      code: string;
      before: { name: string; source: string };
      after: { name: string; source: string };
    }[];
  })[];
}
export const courseColumns: string;
export function stable(value: unknown): string;
export function makeCorrectionPlan(datasets: CatalogSnapshot[], seed: { courses: { code: string; name: string; source: string }[] }, database: string): CorrectionPlan;
export function applyCorrection(client: Client, plan: CorrectionPlan, rollback?: boolean): Promise<{ version: number; changed: number; alreadyApplied: boolean }[]>;

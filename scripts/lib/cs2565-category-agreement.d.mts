import type { Client } from "pg";
import type { Course } from "../../src/modules/curriculum/types";
import type { CatalogSnapshot } from "./catalog-name-correction.mjs";
export const categoryAgreement: { id: string; group5Codes: string[]; newCourse: Course };
export interface CategoryPlan {
  format: string;
  database: string;
  createdAt: string;
  datasets: (CatalogSnapshot & { offerings: unknown[]; newCourseId: string | null; afterUnresolved: string[]; afterCourses: unknown[] })[];
}
export function makeCategoryPlan(datasets: (CatalogSnapshot & { offerings?: unknown[] })[], database: string): CategoryPlan;
export function applyCategoryAgreement(client: Client, plan: CategoryPlan, rollback?: boolean): Promise<{ version: number; insertedCourses: number; alreadyApplied: boolean }[]>;

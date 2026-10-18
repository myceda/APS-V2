import type { Course, Dataset } from "@/modules/curriculum/types";
export function academicCourses(): Course[] {
  return ["101001", "101002", "101003"].map((code, index) => ({
    code,
    name: `Synthetic Course ${index + 1}`,
    credits: 3,
    category: "specific_required",
    tracks: [],
    grading: "numeric",
    specific: true,
    prerequisite: {
      mode: "all",
      courses: index === 0 ? [] : [index === 1 ? "101001" : "101002"],
      concurrent: false,
      unresolved: null,
    },
    requiresConsent: false,
    source: "Synthetic test fixture, not an academic policy",
  }));
}
export function academicDataset(base: Dataset): Dataset {
  const courses = academicCourses();
  return {
    ...base,
    courses,
    source: "Synthetic test fixture, not CS2565 acceptance",
    groups: [
      {
        category: "specific_required",
        minimum: 9,
        track: "both",
        source: "Synthetic",
      },
    ],
    policy: {
      degreeCredits: 9,
      gpaMinimum: 2,
      retakeCeiling: 1.5,
      repeat: "latest_numeric",
      rounding: "half_up_2",
      gpaComparison: "raw",
      specificGpaBasis: "all_specific",
      prerequisitePass: "any_pass",
      normalMax: 22,
      normalMin: 0,
      summerMax: 9,
      source: "Synthetic test assumptions",
    },
    offerings: courses.flatMap((c) =>
      ([1, 2, 3] as const).map((semester) => ({
        courseCode: c.code,
        year: 0,
        semester,
        availability: "open",
        confidence: "planned",
        source: "Synthetic recurrence",
      })),
    ),
    unresolved: [],
  };
}

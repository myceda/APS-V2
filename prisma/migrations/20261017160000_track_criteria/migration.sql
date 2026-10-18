ALTER TABLE "StudentEnrollment" ADD COLUMN "admissionYear" INTEGER,
ADD COLUMN "cohortVersion" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "cohortSource" TEXT;
CREATE TABLE "TrackCriteria" (
 "id" UUID NOT NULL, "curriculumVersionId" UUID NOT NULL, "catalogueDatasetId" UUID,
 "admissionYears" INTEGER[] NOT NULL, "track" TEXT NOT NULL,
 "year" INTEGER NOT NULL, "semester" INTEGER NOT NULL, "version" INTEGER NOT NULL,
 "editVersion" INTEGER NOT NULL DEFAULT 1, "status" TEXT NOT NULL DEFAULT 'draft',
 "payload" JSONB NOT NULL, "basedOnId" UUID, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "TrackCriteria_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "TrackCriteria_curriculum_fkey" FOREIGN KEY ("curriculumVersionId") REFERENCES "CurriculumVersion"("id") ON DELETE RESTRICT,
 CONSTRAINT "TrackCriteria_catalogue_fkey" FOREIGN KEY ("catalogueDatasetId") REFERENCES "AcademicDataset"("id") ON DELETE RESTRICT,
 CONSTRAINT "TrackCriteria_basedOn_fkey" FOREIGN KEY ("basedOnId") REFERENCES "TrackCriteria"("id") ON DELETE RESTRICT,
 CONSTRAINT "TrackCriteria_status_check" CHECK ("status" IN ('draft','published','withdrawn')),
 CONSTRAINT "TrackCriteria_track_check" CHECK ("track" IN ('project','cooperative'))
);
CREATE INDEX "TrackCriteria_curriculumVersionId_year_semester_track_status_idx" ON "TrackCriteria"("curriculumVersionId","year","semester","track","status");
CREATE TABLE "TrackCriteriaEvent" (
 "id" UUID NOT NULL, "criteriaId" UUID NOT NULL, "actorAccountId" UUID NOT NULL,
 "action" TEXT NOT NULL, "reason" TEXT NOT NULL, "snapshot" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "TrackCriteriaEvent_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "TrackCriteriaEvent_criteriaId_fkey" FOREIGN KEY ("criteriaId") REFERENCES "TrackCriteria"("id") ON DELETE RESTRICT
);
CREATE INDEX "TrackCriteriaEvent_criteriaId_createdAt_idx" ON "TrackCriteriaEvent"("criteriaId","createdAt");

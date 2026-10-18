-- CreateTable
CREATE TABLE "AcademicDataset" (
    "id" UUID NOT NULL,
    "curriculumVersionId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "editVersion" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL,
    "policy" JSONB NOT NULL,
    "groups" JSONB NOT NULL,
    "unresolved" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "AcademicDataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogCourse" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "tracks" TEXT[],
    "grading" TEXT NOT NULL,
    "specific" BOOLEAN NOT NULL DEFAULT false,
    "prerequisite" JSONB NOT NULL,
    "requiresConsent" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL,

    CONSTRAINT "CatalogCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseOffering" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "courseCode" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "semester" INTEGER NOT NULL,
    "availability" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "CourseOffering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivateDocument" (
    "id" UUID NOT NULL,
    "ownerAccountId" UUID NOT NULL,
    "content" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivateDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptDraft" (
    "id" UUID NOT NULL,
    "ownerAccountId" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "baseRevisionId" UUID,
    "editVersion" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "header" JSONB NOT NULL,
    "extracted" JSONB NOT NULL,
    "pages" INTEGER NOT NULL,
    "summaries" JSONB NOT NULL,
    "issues" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscriptDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftCourseAttempt" (
    "id" UUID NOT NULL,
    "draftId" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "courseCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "credits" INTEGER,
    "grade" TEXT,
    "gradePoints" DOUBLE PRECISION,
    "year" INTEGER,
    "semester" INTEGER,
    "kind" TEXT NOT NULL,
    "sourcePage" INTEGER NOT NULL,

    CONSTRAINT "DraftCourseAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptRevision" (
    "id" UUID NOT NULL,
    "ownerAccountId" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "draftId" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscriptRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentAcademicState" (
    "enrollmentId" UUID NOT NULL,
    "currentRevisionId" UUID,

    CONSTRAINT "StudentAcademicState_pkey" PRIMARY KEY ("enrollmentId")
);

-- CreateTable
CREATE TABLE "AnalysisRun" (
    "id" UUID NOT NULL,
    "ownerAccountId" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulationScenario" (
    "id" UUID NOT NULL,
    "ownerAccountId" UUID NOT NULL,
    "analysisId" UUID NOT NULL,
    "events" JSONB NOT NULL,
    "comparison" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulationScenario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcademicDataset_curriculumVersionId_version_key" ON "AcademicDataset"("curriculumVersionId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogCourse_datasetId_code_key" ON "CatalogCourse"("datasetId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CourseOffering_datasetId_courseCode_year_semester_key" ON "CourseOffering"("datasetId", "courseCode", "year", "semester");

-- CreateIndex
CREATE INDEX "PrivateDocument_ownerAccountId_idx" ON "PrivateDocument"("ownerAccountId");

-- CreateIndex
CREATE INDEX "TranscriptDraft_ownerAccountId_createdAt_idx" ON "TranscriptDraft"("ownerAccountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DraftCourseAttempt_draftId_ordinal_key" ON "DraftCourseAttempt"("draftId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptRevision_draftId_key" ON "TranscriptRevision"("draftId");

-- CreateIndex
CREATE INDEX "TranscriptRevision_ownerAccountId_confirmedAt_idx" ON "TranscriptRevision"("ownerAccountId", "confirmedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudentAcademicState_currentRevisionId_key" ON "StudentAcademicState"("currentRevisionId");

-- CreateIndex
CREATE INDEX "AnalysisRun_ownerAccountId_createdAt_idx" ON "AnalysisRun"("ownerAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "SimulationScenario_ownerAccountId_createdAt_idx" ON "SimulationScenario"("ownerAccountId", "createdAt");

-- AddForeignKey
ALTER TABLE "AcademicDataset" ADD CONSTRAINT "AcademicDataset_curriculumVersionId_fkey" FOREIGN KEY ("curriculumVersionId") REFERENCES "CurriculumVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogCourse" ADD CONSTRAINT "CatalogCourse_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "AcademicDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseOffering" ADD CONSTRAINT "CourseOffering_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "AcademicDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptDraft" ADD CONSTRAINT "TranscriptDraft_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "StudentEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptDraft" ADD CONSTRAINT "TranscriptDraft_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "PrivateDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftCourseAttempt" ADD CONSTRAINT "DraftCourseAttempt_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "TranscriptDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptRevision" ADD CONSTRAINT "TranscriptRevision_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "StudentEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptRevision" ADD CONSTRAINT "TranscriptRevision_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "TranscriptDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentAcademicState" ADD CONSTRAINT "StudentAcademicState_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "StudentEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentAcademicState" ADD CONSTRAINT "StudentAcademicState_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "TranscriptRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "TranscriptRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "AcademicDataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulationScenario" ADD CONSTRAINT "SimulationScenario_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "AnalysisRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

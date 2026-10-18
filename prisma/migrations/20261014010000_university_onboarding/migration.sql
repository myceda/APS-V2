ALTER TABLE "User" ADD COLUMN "googleHostedDomain" TEXT;
CREATE TYPE "EnrollmentRequestStatus" AS ENUM ('pending', 'approved', 'rejected');
CREATE TABLE "EnrollmentRequest" (
  "id" UUID NOT NULL,
  "accountAccessId" UUID NOT NULL,
  "studentCode" TEXT NOT NULL,
  "curriculumVersionId" UUID NOT NULL,
  "trackState" "TrackState" NOT NULL DEFAULT 'unknown',
  "trackId" UUID,
  "status" "EnrollmentRequestStatus" NOT NULL DEFAULT 'pending',
  "version" INTEGER NOT NULL DEFAULT 1,
  "reviewReason" TEXT,
  "reviewerAccountId" UUID,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnrollmentRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EnrollmentRequest_owner_fkey" FOREIGN KEY ("accountAccessId") REFERENCES "AccountAccess"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EnrollmentRequest_reviewer_fkey" FOREIGN KEY ("reviewerAccountId") REFERENCES "AccountAccess"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EnrollmentRequest_version_fkey" FOREIGN KEY ("curriculumVersionId") REFERENCES "CurriculumVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EnrollmentRequest_track_fkey" FOREIGN KEY ("trackId", "curriculumVersionId") REFERENCES "Track"("id", "curriculumVersionId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EnrollmentRequest_track_check" CHECK (("trackState" = 'selected' AND "trackId" IS NOT NULL) OR ("trackState" <> 'selected' AND "trackId" IS NULL)),
  CONSTRAINT "EnrollmentRequest_review_check" CHECK (("status" = 'pending' AND "reviewerAccountId" IS NULL AND "reviewedAt" IS NULL AND "reviewReason" IS NULL) OR ("status" <> 'pending' AND "reviewerAccountId" IS NOT NULL AND "reviewedAt" IS NOT NULL)),
  CONSTRAINT "EnrollmentRequest_rejection_reason" CHECK ("status" <> 'rejected' OR length(trim("reviewReason")) > 0)
);
CREATE INDEX "EnrollmentRequest_accountAccessId_createdAt_idx" ON "EnrollmentRequest"("accountAccessId", "createdAt");
CREATE UNIQUE INDEX "EnrollmentRequest_one_pending" ON "EnrollmentRequest"("accountAccessId") WHERE "status" = 'pending';

-- Preserve existing enrollments and transcripts; first-upload drafts can exist
-- before a student confirms their academic profile.
ALTER TABLE "StudentEnrollment" ADD COLUMN "confirmationSource" TEXT NOT NULL DEFAULT 'admin_verified';
ALTER TABLE "TranscriptDraft" ALTER COLUMN "enrollmentId" DROP NOT NULL;

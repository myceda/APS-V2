-- Submission context is not an administrator's review decision.
ALTER TABLE "EnrollmentRequest" ADD COLUMN "submissionReason" TEXT;
ALTER TABLE "StudentEnrollment" ADD CONSTRAINT "StudentEnrollment_confirmation_source_check"
  CHECK ("confirmationSource" IN ('admin_verified', 'student_confirmed'));

-- CreateEnum
CREATE TYPE "AccessRole" AS ENUM ('student', 'admin');

-- CreateEnum
CREATE TYPE "AccessStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "TrackState" AS ENUM ('selected', 'not_selected', 'unknown');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" UUID NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" UUID NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountAccess" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "AccessRole" NOT NULL,
    "status" "AccessStatus" NOT NULL DEFAULT 'active',
    "canManageAccounts" BOOLEAN NOT NULL DEFAULT false,
    "authUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Curriculum" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Curriculum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurriculumVersion" (
    "id" UUID NOT NULL,
    "curriculumId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'draft',

    CONSTRAINT "CurriculumVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Track" (
    "id" UUID NOT NULL,
    "curriculumVersionId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Track_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentEnrollment" (
    "id" UUID NOT NULL,
    "accountAccessId" UUID NOT NULL,
    "studentCode" TEXT NOT NULL,
    "curriculumVersionId" UUID NOT NULL,
    "trackState" "TrackState" NOT NULL DEFAULT 'unknown',
    "trackId" UUID,

    CONSTRAINT "StudentEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurriculumAdmin" (
    "accountAccessId" UUID NOT NULL,
    "curriculumId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CurriculumAdmin_pkey" PRIMARY KEY ("accountAccessId","curriculumId")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "actorAccountId" UUID NOT NULL,
    "targetAccountId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "changedFields" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "AccountAccess_email_key" ON "AccountAccess"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AccountAccess_authUserId_key" ON "AccountAccess"("authUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Curriculum_code_key" ON "Curriculum"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CurriculumVersion_code_key" ON "CurriculumVersion"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Track_curriculumVersionId_code_key" ON "Track"("curriculumVersionId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Track_id_curriculumVersionId_key" ON "Track"("id", "curriculumVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentEnrollment_accountAccessId_key" ON "StudentEnrollment"("accountAccessId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentEnrollment_curriculumVersionId_studentCode_key" ON "StudentEnrollment"("curriculumVersionId", "studentCode");

-- CreateIndex
CREATE INDEX "AuditEvent_targetAccountId_createdAt_idx" ON "AuditEvent"("targetAccountId", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountAccess" ADD CONSTRAINT "AccountAccess_authUserId_fkey" FOREIGN KEY ("authUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumVersion" ADD CONSTRAINT "CurriculumVersion_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "Curriculum"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Track" ADD CONSTRAINT "Track_curriculumVersionId_fkey" FOREIGN KEY ("curriculumVersionId") REFERENCES "CurriculumVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEnrollment" ADD CONSTRAINT "StudentEnrollment_accountAccessId_fkey" FOREIGN KEY ("accountAccessId") REFERENCES "AccountAccess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEnrollment" ADD CONSTRAINT "StudentEnrollment_curriculumVersionId_fkey" FOREIGN KEY ("curriculumVersionId") REFERENCES "CurriculumVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEnrollment" ADD CONSTRAINT "StudentEnrollment_trackId_curriculumVersionId_fkey" FOREIGN KEY ("trackId", "curriculumVersionId") REFERENCES "Track"("id", "curriculumVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumAdmin" ADD CONSTRAINT "CurriculumAdmin_accountAccessId_fkey" FOREIGN KEY ("accountAccessId") REFERENCES "AccountAccess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumAdmin" ADD CONSTRAINT "CurriculumAdmin_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "Curriculum"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Identity and access invariants beyond Prisma's schema syntax.
ALTER TABLE "AccountAccess" ADD CONSTRAINT "AccountAccess_normalized_email" CHECK (email = lower(btrim(email)));
ALTER TABLE "AccountAccess" ADD CONSTRAINT "AccountAccess_manager_active_admin" CHECK (NOT "canManageAccounts" OR (role = 'admin' AND status = 'active'));
CREATE UNIQUE INDEX "AccountAccess_single_manager" ON "AccountAccess" ((true)) WHERE "canManageAccounts";
ALTER TABLE "StudentEnrollment" ADD CONSTRAINT "StudentEnrollment_track_state" CHECK (("trackState" = 'selected' AND "trackId" IS NOT NULL) OR ("trackState" IN ('not_selected', 'unknown') AND "trackId" IS NULL));

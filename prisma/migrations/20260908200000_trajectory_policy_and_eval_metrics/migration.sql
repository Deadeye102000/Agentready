-- AlterTable
ALTER TABLE "TaskContract" ADD COLUMN "trajectoryPolicy" JSONB;

-- AlterTable
ALTER TABLE "EvalRun" ADD COLUMN "trajectoryScore" DOUBLE PRECISION,
ADD COLUMN "violations" JSONB DEFAULT '[]';

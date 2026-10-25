-- AlterTable
ALTER TABLE "import_batches" ADD COLUMN     "error_message" TEXT,
ADD COLUMN     "phase" TEXT,
ADD COLUMN     "summary" JSONB;

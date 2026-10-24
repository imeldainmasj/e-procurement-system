-- AlterTable
ALTER TABLE "works" ADD COLUMN     "data_issues" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "has_data_issues" BOOLEAN NOT NULL DEFAULT false;

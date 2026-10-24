-- SIPITA redesign (CLAUDE.md §1): from an in-system PR/approval/warehouse workflow to
-- IT SAPM procurement records + work tracking. Rows of the old model cannot be mapped to
-- the new one (users without employee_id/username, divisions without a directorate, POs
-- without a work), so the surviving tables are emptied first; the seed repopulates them.
TRUNCATE TABLE
  "users", "divisions", "vendors", "purchase_orders", "notifications", "audit_logs",
  "attachments", "refresh_tokens", "app_settings", "document_sequences"
CASCADE;

-- CreateEnum
CREATE TYPE "JobLevel" AS ENUM ('STAFF', 'MANAGER_L1', 'MANAGER_L2');

-- CreateEnum
CREATE TYPE "Feature" AS ENUM ('DASHBOARD', 'WORK', 'MONITORING', 'AGREEMENT', 'VENDOR', 'REPORT', 'IMPORT', 'SETTINGS');

-- CreateEnum
CREATE TYPE "ProcurementType" AS ENUM ('RENEWAL_LICENSE', 'NEW_LICENSE', 'NEW_APPLICATION');

-- CreateEnum
CREATE TYPE "ProjectCategory" AS ENUM ('BAU', 'PROJECT');

-- CreateEnum
CREATE TYPE "ProcurementMethod" AS ENUM ('TENDER', 'BIDDING', 'SPECIAL_EXTENSION', 'DIRECT_APPOINTMENT');

-- CreateEnum
CREATE TYPE "RfqMethod" AS ENUM ('TENDER', 'BIDDING');

-- CreateEnum
CREATE TYPE "MemoType" AS ENUM ('MEMO_PROCUREMENT', 'MEMO_PL', 'MEMO_PK', 'MOA_TENDER_RESULT', 'MOA_PL', 'MOA_PK', 'MOA_COST');

-- CreateEnum
CREATE TYPE "MilestoneType" AS ENUM ('MEMO', 'RFQ', 'PVP', 'OFFICIAL_APPROVAL', 'MOA_METHOD', 'MOA_COST', 'LOA', 'PO', 'AGREEMENT', 'AGREEMENT_OR_ADDENDUM');

-- CreateEnum
CREATE TYPE "Executor" AS ENUM ('IT', 'OTHER_TEAM', 'DIRECTORS', 'OFFICIAL');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'DONE', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "WorkStatus" AS ENUM ('ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PkResult" AS ENUM ('ADDENDUM', 'NEW_AGREEMENT');

-- CreateEnum
CREATE TYPE "PvpStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PvpDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PoType" AS ENUM ('NEW', 'RENEWAL');

-- CreateEnum
CREATE TYPE "AgreementType" AS ENUM ('NEW', 'RENEWAL');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PREVIEW', 'COMMITTED', 'ROLLED_BACK', 'FAILED');

-- CreateEnum
CREATE TYPE "IssueLevel" AS ENUM ('ERROR', 'WARNING');

-- CreateEnum
CREATE TYPE "AuditSource" AS ENUM ('APP', 'IMPORT');

-- DropForeignKey
ALTER TABLE "approval_steps" DROP CONSTRAINT "approval_steps_approver_id_fkey";

-- DropForeignKey
ALTER TABLE "approval_steps" DROP CONSTRAINT "approval_steps_memo_id_fkey";

-- DropForeignKey
ALTER TABLE "divisions" DROP CONSTRAINT "divisions_head_user_id_fkey";

-- DropForeignKey
ALTER TABLE "internal_memos" DROP CONSTRAINT "internal_memos_approval_rule_id_fkey";

-- DropForeignKey
ALTER TABLE "internal_memos" DROP CONSTRAINT "internal_memos_created_by_id_fkey";

-- DropForeignKey
ALTER TABLE "internal_memos" DROP CONSTRAINT "internal_memos_pr_id_fkey";

-- DropForeignKey
ALTER TABLE "items" DROP CONSTRAINT "items_category_id_fkey";

-- DropForeignKey
ALTER TABLE "price_history" DROP CONSTRAINT "price_history_item_id_fkey";

-- DropForeignKey
ALTER TABLE "price_history" DROP CONSTRAINT "price_history_vendor_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_order_items" DROP CONSTRAINT "purchase_order_items_item_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_order_items" DROP CONSTRAINT "purchase_order_items_po_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_order_items" DROP CONSTRAINT "purchase_order_items_pr_item_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_created_by_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_issued_by_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_pr_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_quotation_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_vendor_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_request_items" DROP CONSTRAINT "purchase_request_items_item_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_request_items" DROP CONSTRAINT "purchase_request_items_pr_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_requests" DROP CONSTRAINT "purchase_requests_created_by_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_requests" DROP CONSTRAINT "purchase_requests_division_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_requests" DROP CONSTRAINT "purchase_requests_requester_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_requests" DROP CONSTRAINT "purchase_requests_stock_checked_by_id_fkey";

-- DropForeignKey
ALTER TABLE "quotation_items" DROP CONSTRAINT "quotation_items_pr_item_id_fkey";

-- DropForeignKey
ALTER TABLE "quotation_items" DROP CONSTRAINT "quotation_items_quotation_id_fkey";

-- DropForeignKey
ALTER TABLE "quotations" DROP CONSTRAINT "quotations_attachment_id_fkey";

-- DropForeignKey
ALTER TABLE "quotations" DROP CONSTRAINT "quotations_created_by_id_fkey";

-- DropForeignKey
ALTER TABLE "quotations" DROP CONSTRAINT "quotations_pr_id_fkey";

-- DropForeignKey
ALTER TABLE "quotations" DROP CONSTRAINT "quotations_selected_by_id_fkey";

-- DropForeignKey
ALTER TABLE "quotations" DROP CONSTRAINT "quotations_vendor_id_fkey";

-- DropForeignKey
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_role_id_fkey";

-- DropForeignKey
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_user_id_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_division_id_fkey";

-- DropForeignKey
ALTER TABLE "vendor_categories" DROP CONSTRAINT "vendor_categories_category_id_fkey";

-- DropForeignKey
ALTER TABLE "vendor_categories" DROP CONSTRAINT "vendor_categories_vendor_id_fkey";

-- DropForeignKey
ALTER TABLE "vendor_documents" DROP CONSTRAINT "vendor_documents_attachment_id_fkey";

-- DropForeignKey
ALTER TABLE "vendor_documents" DROP CONSTRAINT "vendor_documents_uploaded_by_id_fkey";

-- DropForeignKey
ALTER TABLE "vendor_documents" DROP CONSTRAINT "vendor_documents_vendor_id_fkey";

-- DropForeignKey
ALTER TABLE "vendor_ratings" DROP CONSTRAINT "vendor_ratings_po_id_fkey";

-- DropForeignKey
ALTER TABLE "vendor_ratings" DROP CONSTRAINT "vendor_ratings_rated_by_id_fkey";

-- DropForeignKey
ALTER TABLE "vendor_ratings" DROP CONSTRAINT "vendor_ratings_vendor_id_fkey";

-- DropForeignKey
ALTER TABLE "vendors" DROP CONSTRAINT "vendors_created_by_id_fkey";

-- DropIndex
DROP INDEX "divisions_head_user_id_key";

-- DropIndex
DROP INDEX "purchase_orders_number_key";

-- DropIndex
DROP INDEX "purchase_orders_order_date_idx";

-- DropIndex
DROP INDEX "purchase_orders_pr_id_idx";

-- DropIndex
DROP INDEX "purchase_orders_status_idx";

-- DropIndex
DROP INDEX "purchase_orders_vendor_id_idx";

-- DropIndex
DROP INDEX "users_division_id_idx";

-- DropIndex
DROP INDEX "users_nip_key";

-- DropIndex
DROP INDEX "vendors_status_idx";

-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "import_batch_id" UUID,
ADD COLUMN     "source" "AuditSource" NOT NULL DEFAULT 'APP';

-- AlterTable
ALTER TABLE "divisions" DROP COLUMN "head_user_id",
ADD COLUMN     "directorate_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "dedupe_key" TEXT;

-- AlterTable
ALTER TABLE "purchase_orders" DROP COLUMN "cancel_reason",
DROP COLUMN "cancelled_at",
DROP COLUMN "delivery_address",
DROP COLUMN "expected_date",
DROP COLUMN "issued_at",
DROP COLUMN "issued_by_id",
DROP COLUMN "notes",
DROP COLUMN "number",
DROP COLUMN "order_date",
DROP COLUMN "pr_id",
DROP COLUMN "quotation_id",
DROP COLUMN "status",
DROP COLUMN "subtotal",
DROP COLUMN "tax_amount",
DROP COLUMN "tax_percent",
DROP COLUMN "terms",
DROP COLUMN "total",
DROP COLUMN "vendor_id",
ADD COLUMN     "amount" DECIMAL(18,2) NOT NULL,
ADD COLUMN     "amount_idr" DECIMAL(18,2) NOT NULL,
ADD COLUMN     "currency" CHAR(3) NOT NULL DEFAULT 'IDR',
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
ADD COLUMN     "import_batch_id" UUID,
ADD COLUMN     "po_date" DATE NOT NULL,
ADD COLUMN     "po_name" TEXT NOT NULL,
ADD COLUMN     "po_no" TEXT NOT NULL,
ADD COLUMN     "po_type" "PoType" NOT NULL,
ADD COLUMN     "previous_po_amount" DECIMAL(18,2),
ADD COLUMN     "previous_po_currency" CHAR(3),
ADD COLUMN     "previous_po_id" UUID,
ADD COLUMN     "previous_po_no" TEXT,
ADD COLUMN     "requester_name" TEXT,
ADD COLUMN     "updated_by_id" UUID,
ADD COLUMN     "work_id" UUID NOT NULL,
ALTER COLUMN "created_by_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "approval_level",
DROP COLUMN "division_id",
DROP COLUMN "nip",
DROP COLUMN "phone",
ADD COLUMN     "department_id" UUID,
ADD COLUMN     "employee_id" TEXT NOT NULL,
ADD COLUMN     "is_admin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "job_level" "JobLevel" NOT NULL DEFAULT 'STAFF',
ADD COLUMN     "username" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "vendors" DROP COLUMN "bank_account",
DROP COLUMN "bank_account_name",
DROP COLUMN "bank_name",
DROP COLUMN "city",
DROP COLUMN "notes",
DROP COLUMN "status",
DROP COLUMN "status_reason",
ADD COLUMN     "import_batch_id" UUID,
ADD COLUMN     "updated_by_id" UUID,
ALTER COLUMN "created_by_id" DROP NOT NULL;

-- DropTable
DROP TABLE "approval_rules";

-- DropTable
DROP TABLE "approval_steps";

-- DropTable
DROP TABLE "internal_memos";

-- DropTable
DROP TABLE "item_categories";

-- DropTable
DROP TABLE "items";

-- DropTable
DROP TABLE "price_history";

-- DropTable
DROP TABLE "purchase_order_items";

-- DropTable
DROP TABLE "purchase_request_items";

-- DropTable
DROP TABLE "purchase_requests";

-- DropTable
DROP TABLE "quotation_items";

-- DropTable
DROP TABLE "quotations";

-- DropTable
DROP TABLE "roles";

-- DropTable
DROP TABLE "user_roles";

-- DropTable
DROP TABLE "vendor_categories";

-- DropTable
DROP TABLE "vendor_documents";

-- DropTable
DROP TABLE "vendor_ratings";

-- DropTable
DROP TABLE "warehouses";

-- DropEnum
DROP TYPE "ApprovalStepStatus";

-- DropEnum
DROP TYPE "MemoStatus";

-- DropEnum
DROP TYPE "PoStatus";

-- DropEnum
DROP TYPE "PrPriority";

-- DropEnum
DROP TYPE "PrStatus";

-- DropEnum
DROP TYPE "PriceSourceType";

-- DropEnum
DROP TYPE "RoleCode";

-- DropEnum
DROP TYPE "VendorDocumentType";

-- DropEnum
DROP TYPE "VendorStatus";

-- CreateTable
CREATE TABLE "directorates" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "directorates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "division_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permissions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "feature" "Feature" NOT NULL,
    "can_view" BOOLEAN NOT NULL DEFAULT true,
    "can_create" BOOLEAN NOT NULL DEFAULT false,
    "can_update" BOOLEAN NOT NULL DEFAULT false,
    "can_delete" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "works" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "procurement_type" "ProcurementType" NOT NULL,
    "category" "ProjectCategory" NOT NULL,
    "method" "ProcurementMethod" NOT NULL,
    "procurement_year" INTEGER NOT NULL,
    "pic_id" UUID NOT NULL,
    "requester_directorate_id" UUID,
    "vendor_id" UUID,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'IDR',
    "exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "amount_idr" DECIMAL(18,2) NOT NULL,
    "previous_purchase_amount" DECIMAL(18,2),
    "increase_percent" DECIMAL(7,2),
    "pvp_required" BOOLEAN NOT NULL DEFAULT false,
    "period_start" DATE,
    "period_end" DATE,
    "source_agreement_id" UUID,
    "pk_result" "PkResult",
    "status" "WorkStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "import_batch_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "works_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_milestones" (
    "id" UUID NOT NULL,
    "work_id" UUID NOT NULL,
    "type" "MilestoneType" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "executor" "Executor" NOT NULL,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "is_conditional" BOOLEAN NOT NULL DEFAULT false,
    "prerequisites" "MilestoneType"[],
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "reference_no" TEXT,
    "notes" TEXT,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_updates" (
    "id" UUID NOT NULL,
    "work_id" UUID NOT NULL,
    "milestone_id" UUID,
    "author_id" UUID NOT NULL,
    "note" TEXT NOT NULL,
    "status_from" "MilestoneStatus",
    "status_to" "MilestoneStatus",
    "attachment_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestone_templates" (
    "id" UUID NOT NULL,
    "method" "ProcurementMethod" NOT NULL,
    "type" "MilestoneType" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "executor" "Executor" NOT NULL,
    "prerequisites" "MilestoneType"[],
    "is_conditional" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "milestone_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memos" (
    "id" UUID NOT NULL,
    "work_id" UUID NOT NULL,
    "memo_no" TEXT NOT NULL,
    "memo_type" "MemoType" NOT NULL,
    "title" TEXT NOT NULL,
    "memo_date" DATE NOT NULL,
    "requester_name" TEXT,
    "amount" DECIMAL(18,2),
    "currency" CHAR(3),
    "exchange_rate" DECIMAL(18,6),
    "amount_idr" DECIMAL(18,2),
    "notes" TEXT,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "import_batch_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "memos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfqs" (
    "id" UUID NOT NULL,
    "work_id" UUID NOT NULL,
    "rfq_no" TEXT NOT NULL,
    "method" "RfqMethod" NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'IDR',
    "exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "amount_idr" DECIMAL(18,2) NOT NULL,
    "term_of_payment" TEXT,
    "loa_no" TEXT,
    "loa_date" DATE,
    "loa_processed_by" TEXT,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "import_batch_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "rfqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pvp_forums" (
    "id" UUID NOT NULL,
    "work_id" UUID NOT NULL,
    "pvp_date" DATE NOT NULL,
    "status" "PvpStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "import_batch_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "pvp_forums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pvp_approvals" (
    "id" UUID NOT NULL,
    "pvp_forum_id" UUID NOT NULL,
    "director_name" TEXT NOT NULL,
    "decision" "PvpDecision" NOT NULL,
    "approval_date" DATE NOT NULL,
    "notes" TEXT,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "import_batch_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "pvp_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "po_payment_terms" (
    "id" UUID NOT NULL,
    "po_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "percentage" DECIMAL(5,2),
    "amount" DECIMAL(18,2) NOT NULL,
    "due_date" DATE,
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "import_batch_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "po_payment_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agreements" (
    "id" UUID NOT NULL,
    "agreement_no" TEXT NOT NULL,
    "agreement_type" "AgreementType" NOT NULL,
    "title" TEXT NOT NULL,
    "vendor_id" UUID NOT NULL,
    "po_id" UUID NOT NULL,
    "work_id" UUID NOT NULL,
    "pic_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'IDR',
    "exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "amount_idr" DECIMAL(18,2) NOT NULL,
    "status" "AgreementStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "import_batch_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addendums" (
    "id" UUID NOT NULL,
    "agreement_id" UUID NOT NULL,
    "work_id" UUID NOT NULL,
    "addendum_no" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "addendum_date" DATE NOT NULL,
    "new_period_end" DATE,
    "value_change" DECIMAL(18,2),
    "currency" CHAR(3),
    "exchange_rate" DECIMAL(18,6),
    "value_change_idr" DECIMAL(18,2),
    "po_id" UUID,
    "notes" TEXT,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "import_batch_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "addendums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT,
    "uploaded_by_id" UUID NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ImportStatus" NOT NULL DEFAULT 'PREVIEW',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "valid_rows" INTEGER NOT NULL DEFAULT 0,
    "warning_rows" INTEGER NOT NULL DEFAULT 0,
    "error_rows" INTEGER NOT NULL DEFAULT 0,
    "committed_at" TIMESTAMP(3),
    "rolled_back_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_row_issues" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "sheet" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "level" "IssueLevel" NOT NULL,
    "field" TEXT,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_row_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "directorates_code_key" ON "directorates"("code");

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE INDEX "departments_division_id_idx" ON "departments"("division_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_permissions_user_id_feature_key" ON "user_permissions"("user_id", "feature");

-- CreateIndex
CREATE UNIQUE INDEX "works_code_key" ON "works"("code");

-- CreateIndex
CREATE INDEX "works_pic_id_idx" ON "works"("pic_id");

-- CreateIndex
CREATE INDEX "works_procurement_year_idx" ON "works"("procurement_year");

-- CreateIndex
CREATE INDEX "works_method_idx" ON "works"("method");

-- CreateIndex
CREATE INDEX "works_status_idx" ON "works"("status");

-- CreateIndex
CREATE INDEX "works_vendor_id_idx" ON "works"("vendor_id");

-- CreateIndex
CREATE INDEX "works_import_batch_id_idx" ON "works"("import_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_milestones_work_id_type_key" ON "work_milestones"("work_id", "type");

-- CreateIndex
CREATE INDEX "work_updates_work_id_created_at_idx" ON "work_updates"("work_id", "created_at");

-- CreateIndex
CREATE INDEX "work_updates_author_id_idx" ON "work_updates"("author_id");

-- CreateIndex
CREATE UNIQUE INDEX "milestone_templates_method_type_key" ON "milestone_templates"("method", "type");

-- CreateIndex
CREATE UNIQUE INDEX "memos_memo_no_key" ON "memos"("memo_no");

-- CreateIndex
CREATE INDEX "memos_work_id_idx" ON "memos"("work_id");

-- CreateIndex
CREATE INDEX "memos_import_batch_id_idx" ON "memos"("import_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "rfqs_work_id_key" ON "rfqs"("work_id");

-- CreateIndex
CREATE UNIQUE INDEX "rfqs_rfq_no_key" ON "rfqs"("rfq_no");

-- CreateIndex
CREATE UNIQUE INDEX "rfqs_loa_no_key" ON "rfqs"("loa_no");

-- CreateIndex
CREATE INDEX "rfqs_import_batch_id_idx" ON "rfqs"("import_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "pvp_forums_work_id_key" ON "pvp_forums"("work_id");

-- CreateIndex
CREATE INDEX "pvp_forums_import_batch_id_idx" ON "pvp_forums"("import_batch_id");

-- CreateIndex
CREATE INDEX "pvp_approvals_pvp_forum_id_idx" ON "pvp_approvals"("pvp_forum_id");

-- CreateIndex
CREATE INDEX "pvp_approvals_import_batch_id_idx" ON "pvp_approvals"("import_batch_id");

-- CreateIndex
CREATE INDEX "po_payment_terms_import_batch_id_idx" ON "po_payment_terms"("import_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "po_payment_terms_po_id_sequence_key" ON "po_payment_terms"("po_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "agreements_agreement_no_key" ON "agreements"("agreement_no");

-- CreateIndex
CREATE UNIQUE INDEX "agreements_po_id_key" ON "agreements"("po_id");

-- CreateIndex
CREATE INDEX "agreements_vendor_id_idx" ON "agreements"("vendor_id");

-- CreateIndex
CREATE INDEX "agreements_work_id_idx" ON "agreements"("work_id");

-- CreateIndex
CREATE INDEX "agreements_period_end_idx" ON "agreements"("period_end");

-- CreateIndex
CREATE INDEX "agreements_status_idx" ON "agreements"("status");

-- CreateIndex
CREATE INDEX "agreements_import_batch_id_idx" ON "agreements"("import_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "addendums_addendum_no_key" ON "addendums"("addendum_no");

-- CreateIndex
CREATE INDEX "addendums_agreement_id_idx" ON "addendums"("agreement_id");

-- CreateIndex
CREATE INDEX "addendums_work_id_idx" ON "addendums"("work_id");

-- CreateIndex
CREATE INDEX "addendums_import_batch_id_idx" ON "addendums"("import_batch_id");

-- CreateIndex
CREATE INDEX "import_batches_uploaded_at_idx" ON "import_batches"("uploaded_at");

-- CreateIndex
CREATE INDEX "import_row_issues_batch_id_level_idx" ON "import_row_issues"("batch_id", "level");

-- CreateIndex
CREATE INDEX "audit_logs_import_batch_id_idx" ON "audit_logs"("import_batch_id");

-- CreateIndex
CREATE INDEX "divisions_directorate_id_idx" ON "divisions"("directorate_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_po_no_key" ON "purchase_orders"("po_no");

-- CreateIndex
CREATE INDEX "purchase_orders_work_id_idx" ON "purchase_orders"("work_id");

-- CreateIndex
CREATE INDEX "purchase_orders_import_batch_id_idx" ON "purchase_orders"("import_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_id_key" ON "users"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_department_id_idx" ON "users"("department_id");

-- CreateIndex
CREATE INDEX "vendors_import_batch_id_idx" ON "vendors"("import_batch_id");

-- AddForeignKey
ALTER TABLE "divisions" ADD CONSTRAINT "divisions_directorate_id_fkey" FOREIGN KEY ("directorate_id") REFERENCES "directorates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "works" ADD CONSTRAINT "works_pic_id_fkey" FOREIGN KEY ("pic_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "works" ADD CONSTRAINT "works_requester_directorate_id_fkey" FOREIGN KEY ("requester_directorate_id") REFERENCES "directorates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "works" ADD CONSTRAINT "works_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "works" ADD CONSTRAINT "works_source_agreement_id_fkey" FOREIGN KEY ("source_agreement_id") REFERENCES "agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "works" ADD CONSTRAINT "works_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_milestones" ADD CONSTRAINT "work_milestones_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "works"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_updates" ADD CONSTRAINT "work_updates_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "works"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_updates" ADD CONSTRAINT "work_updates_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "work_milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_updates" ADD CONSTRAINT "work_updates_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_updates" ADD CONSTRAINT "work_updates_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memos" ADD CONSTRAINT "memos_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pvp_forums" ADD CONSTRAINT "pvp_forums_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pvp_approvals" ADD CONSTRAINT "pvp_approvals_pvp_forum_id_fkey" FOREIGN KEY ("pvp_forum_id") REFERENCES "pvp_forums"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_previous_po_id_fkey" FOREIGN KEY ("previous_po_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_payment_terms" ADD CONSTRAINT "po_payment_terms_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_pic_id_fkey" FOREIGN KEY ("pic_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addendums" ADD CONSTRAINT "addendums_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addendums" ADD CONSTRAINT "addendums_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addendums" ADD CONSTRAINT "addendums_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_row_issues" ADD CONSTRAINT "import_row_issues_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

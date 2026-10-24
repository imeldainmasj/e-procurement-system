-- CreateEnum
CREATE TYPE "PrStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'STOCK_CHECK', 'FULFILLED_FROM_STOCK', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'QUOTATION', 'PO_ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PrPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateTable
CREATE TABLE "purchase_requests" (
    "id" UUID NOT NULL,
    "number" TEXT,
    "requester_id" UUID NOT NULL,
    "division_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "priority" "PrPriority" NOT NULL DEFAULT 'MEDIUM',
    "needed_date" DATE NOT NULL,
    "estimated_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "PrStatus" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMP(3),
    "stock_checked_by_id" UUID,
    "stock_checked_at" TIMESTAMP(3),
    "stock_check_notes" TEXT,
    "cancel_reason" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_request_items" (
    "id" UUID NOT NULL,
    "pr_id" UUID NOT NULL,
    "item_id" UUID,
    "free_text_name" TEXT,
    "unit" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "estimated_unit_price" DECIMAL(18,2) NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requests_number_key" ON "purchase_requests"("number");

-- CreateIndex
CREATE INDEX "purchase_requests_requester_id_idx" ON "purchase_requests"("requester_id");

-- CreateIndex
CREATE INDEX "purchase_requests_division_id_idx" ON "purchase_requests"("division_id");

-- CreateIndex
CREATE INDEX "purchase_requests_status_idx" ON "purchase_requests"("status");

-- CreateIndex
CREATE INDEX "purchase_requests_created_at_idx" ON "purchase_requests"("created_at");

-- CreateIndex
CREATE INDEX "purchase_request_items_pr_id_idx" ON "purchase_request_items"("pr_id");

-- CreateIndex
CREATE INDEX "purchase_request_items_item_id_idx" ON "purchase_request_items"("item_id");

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_stock_checked_by_id_fkey" FOREIGN KEY ("stock_checked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_pr_id_fkey" FOREIGN KEY ("pr_id") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

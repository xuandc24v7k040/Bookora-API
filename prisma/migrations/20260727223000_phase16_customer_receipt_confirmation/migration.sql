-- CreateEnum
CREATE TYPE "OrderHistoryEventType" AS ENUM ('STATUS_CHANGED', 'CUSTOMER_RECEIPT_CONFIRMED');

-- AlterTable
ALTER TABLE "orders"
ADD COLUMN "customer_confirmed_received_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "order_status_histories"
ADD COLUMN "event_type" "OrderHistoryEventType" NOT NULL DEFAULT 'STATUS_CHANGED',
ALTER COLUMN "to_status" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "order_status_histories_order_id_event_type_created_at_idx"
ON "order_status_histories"("order_id", "event_type", "created_at");

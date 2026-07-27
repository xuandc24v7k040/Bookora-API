-- CreateEnum
CREATE TYPE "OrderStatusActorType" AS ENUM ('CUSTOMER', 'ADMIN', 'SYSTEM');

-- AlterTable
ALTER TABLE "orders"
ADD COLUMN "internal_note" TEXT,
ADD COLUMN "internal_note_updated_by_id" TEXT,
ADD COLUMN "internal_note_updated_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "order_status_histories" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus" NOT NULL,
    "actor_type" "OrderStatusActorType" NOT NULL,
    "actor_user_id" TEXT,
    "actor_display_name_snapshot" TEXT,
    "actor_role_snapshot" TEXT,
    "branch_id" TEXT NOT NULL,
    "reason" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orders_branch_id_created_at_idx" ON "orders"("branch_id", "created_at");
CREATE INDEX "orders_branch_id_status_created_at_idx" ON "orders"("branch_id", "status", "created_at");
CREATE INDEX "orders_internal_note_updated_by_id_idx" ON "orders"("internal_note_updated_by_id");
CREATE INDEX "order_status_histories_order_id_created_at_idx" ON "order_status_histories"("order_id", "created_at");
CREATE INDEX "order_status_histories_branch_id_created_at_idx" ON "order_status_histories"("branch_id", "created_at");
CREATE INDEX "order_status_histories_actor_user_id_idx" ON "order_status_histories"("actor_user_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_internal_note_updated_by_id_fkey" FOREIGN KEY ("internal_note_updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "order_status_histories" ADD CONSTRAINT "order_status_histories_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_status_histories" ADD CONSTRAINT "order_status_histories_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "order_status_histories" ADD CONSTRAINT "order_status_histories_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

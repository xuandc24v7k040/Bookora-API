CREATE TYPE "NotificationCategory" AS ENUM ('ORDER', 'PROMOTION');
CREATE TYPE "NotificationDispatchState" AS ENUM ('PENDING', 'DONE', 'SKIPPED');

CREATE TABLE "notification_dispatches" (
  "id" TEXT NOT NULL,
  "event_key" TEXT NOT NULL,
  "kind" VARCHAR(64) NOT NULL,
  "reference_id" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "branch_id" TEXT,
  "due_at" TIMESTAMP(3) NOT NULL,
  "state" "NotificationDispatchState" NOT NULL DEFAULT 'PENDING',
  "audience_cutoff" TIMESTAMP(3),
  "cursor" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "skip_reason" VARCHAR(100),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  CONSTRAINT "notification_dispatches_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notification_dispatches_event_key_key" ON "notification_dispatches"("event_key");
CREATE INDEX "notification_dispatches_state_due_at_idx" ON "notification_dispatches"("state", "due_at");

CREATE TABLE "notifications" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "dispatch_id" TEXT NOT NULL,
  "type" VARCHAR(64) NOT NULL,
  "category" "NotificationCategory" NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "content" VARCHAR(1000) NOT NULL,
  "reference_type" VARCHAR(20) NOT NULL,
  "reference_id" TEXT NOT NULL,
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "notifications_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "notifications_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "notification_dispatches"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "notifications_user_id_dispatch_id_key" ON "notifications"("user_id", "dispatch_id");
CREATE INDEX "notifications_user_id_branch_id_created_at_id_idx" ON "notifications"("user_id", "branch_id", "created_at", "id");
CREATE INDEX "notifications_user_id_branch_id_read_at_idx" ON "notifications"("user_id", "branch_id", "read_at");

-- Observe only FUTURE campaigns at rollout; never blast historical active campaigns.
-- Reusing their existing ULID as a dispatch PK does not alter campaign IDs/data.
INSERT INTO "notification_dispatches" (id, event_key, kind, reference_id, due_at)
SELECT id, 'COUPON_ACTIVE:' || id, 'COUPON_ACTIVE', id, start_at
FROM coupons WHERE start_at > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AND is_active AND visibility = 'PUBLIC'
ON CONFLICT DO NOTHING;
INSERT INTO "notification_dispatches" (id, event_key, kind, reference_id, due_at)
SELECT id, 'FLASH_SALE_ACTIVE:' || id, 'FLASH_SALE_ACTIVE', id, start_at
FROM flash_sales WHERE start_at > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AND state = 'PUBLISHED'
ON CONFLICT DO NOTHING;

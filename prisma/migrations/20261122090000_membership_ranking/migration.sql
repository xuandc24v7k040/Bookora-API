-- CreateEnum
CREATE TYPE "MembershipTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'DIAMOND');

-- CreateEnum
CREATE TYPE "MembershipSource" AS ENUM ('ORDER', 'BACKFILL', 'THRESHOLD_CHANGE');

-- AlterTable
ALTER TABLE "coupons" ADD COLUMN     "minimum_membership_tier" "MembershipTier";

-- CreateTable
CREATE TABLE "membership_config" (
    "id" TEXT NOT NULL DEFAULT 'GLOBAL',
    "silver" DECIMAL(16,0) NOT NULL DEFAULT 2000000,
    "gold" DECIMAL(16,0) NOT NULL DEFAULT 5000000,
    "diamond" DECIMAL(16,0) NOT NULL DEFAULT 10000000,
    "version" INTEGER NOT NULL DEFAULT 1,
    "pending" BOOLEAN NOT NULL DEFAULT false,
    "cursor" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_memberships" (
    "user_id" TEXT NOT NULL,
    "current_tier" "MembershipTier" NOT NULL DEFAULT 'BRONZE',
    "lifetime_spend" DECIMAL(16,0) NOT NULL DEFAULT 0,
    "achieved_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_memberships_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "membership_transactions" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" DECIMAL(16,0) NOT NULL,
    "effective_at" TIMESTAMP(3),
    "source" "MembershipSource" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_tier_histories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "from_tier" "MembershipTier" NOT NULL,
    "to_tier" "MembershipTier" NOT NULL,
    "source" "MembershipSource" NOT NULL,
    "order_id" TEXT,
    "config_version" INTEGER NOT NULL,
    "effective_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_tier_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_config_audits" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "previous" JSONB NOT NULL,
    "next" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_config_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_memberships_current_tier_lifetime_spend_idx" ON "customer_memberships"("current_tier", "lifetime_spend");

-- CreateIndex
CREATE UNIQUE INDEX "membership_transactions_order_id_key" ON "membership_transactions"("order_id");

-- CreateIndex
CREATE INDEX "membership_transactions_user_id_effective_at_id_idx" ON "membership_transactions"("user_id", "effective_at", "id");

-- CreateIndex
CREATE INDEX "membership_tier_histories_user_id_created_at_id_idx" ON "membership_tier_histories"("user_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_tier_histories_user_id_to_tier_key" ON "membership_tier_histories"("user_id", "to_tier");

-- CreateIndex
CREATE UNIQUE INDEX "membership_config_audits_version_key" ON "membership_config_audits"("version");

-- AddForeignKey
ALTER TABLE "customer_memberships" ADD CONSTRAINT "customer_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_transactions" ADD CONSTRAINT "membership_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_transactions" ADD CONSTRAINT "membership_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_tier_histories" ADD CONSTRAINT "membership_tier_histories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Whole VND, fixed ordering and safe JSON/JavaScript number range.
ALTER TABLE membership_config ADD CONSTRAINT membership_thresholds_ordered CHECK
  (id = 'GLOBAL' AND 0 < silver AND silver < gold AND gold < diamond AND diamond <= 9000000000000000);
ALTER TABLE customer_memberships ADD CONSTRAINT membership_spend_safe CHECK (lifetime_spend BETWEEN 0 AND 9000000000000000);
ALTER TABLE membership_transactions ADD CONSTRAINT membership_credit_positive CHECK (amount > 0);
ALTER TABLE membership_tier_histories ADD CONSTRAINT membership_history_upgrade CHECK (to_tier > from_tier);

-- Seed once; deploying/seeding again must never overwrite Admin thresholds.
INSERT INTO membership_config (id, updated_at) VALUES ('GLOBAL', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

CREATE FUNCTION guard_customer_membership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id AND type = 'CUSTOMER') THEN
    RAISE EXCEPTION 'Membership requires CUSTOMER';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.current_tier < OLD.current_tier OR NEW.lifetime_spend < OLD.lifetime_spend) THEN
    RAISE EXCEPTION 'Membership cannot decrease';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER customer_membership_guard BEFORE INSERT OR UPDATE ON customer_memberships
FOR EACH ROW EXECUTE FUNCTION guard_customer_membership();

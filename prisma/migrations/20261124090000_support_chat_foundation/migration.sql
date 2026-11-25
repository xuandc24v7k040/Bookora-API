-- CreateEnum
CREATE TYPE "SupportTicketType" AS ENUM ('GENERAL', 'ORDER');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "type" "SupportTicketType" NOT NULL,
    "order_id" TEXT,
    "subject" VARCHAR(160),
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "assignee_id" TEXT,
    "last_sequence" INTEGER NOT NULL DEFAULT 0,
    "assignee_read_sequence" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "sender_user_id" TEXT NOT NULL,
    "sender_type" "UserType" NOT NULL,
    "client_message_id" VARCHAR(80) NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "text" TEXT,
    "sequence" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_attachments" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "scope_key" TEXT NOT NULL,
    "message_id" TEXT,
    "object_key" TEXT NOT NULL,
    "filename" VARCHAR(180) NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "ready" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_read_states" (
    "ticket_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "last_read_sequence" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_read_states_pkey" PRIMARY KEY ("ticket_id","user_id")
);

-- CreateTable
CREATE TABLE "support_ticket_activities" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "from_status" "SupportTicketStatus",
    "to_status" "SupportTicketStatus" NOT NULL,
    "from_assignee_id" TEXT,
    "to_assignee_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_tickets_customer_id_updated_at_id_idx" ON "support_tickets"("customer_id", "updated_at", "id");

-- CreateIndex
CREATE INDEX "support_tickets_branch_id_status_updated_at_id_idx" ON "support_tickets"("branch_id", "status", "updated_at", "id");

-- CreateIndex
CREATE INDEX "support_tickets_assignee_id_status_idx" ON "support_tickets"("assignee_id", "status");

-- CreateIndex
CREATE INDEX "support_tickets_order_id_idx" ON "support_tickets"("order_id");

-- CreateIndex
CREATE INDEX "support_messages_ticket_id_sender_type_sequence_idx" ON "support_messages"("ticket_id", "sender_type", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "support_messages_sender_user_id_client_message_id_key" ON "support_messages"("sender_user_id", "client_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "support_messages_ticket_id_sequence_key" ON "support_messages"("ticket_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "support_attachments_object_key_key" ON "support_attachments"("object_key");

-- CreateIndex
CREATE INDEX "support_attachments_message_id_idx" ON "support_attachments"("message_id");

-- CreateIndex
CREATE INDEX "support_attachments_owner_id_scope_key_idx" ON "support_attachments"("owner_id", "scope_key");

-- CreateIndex
CREATE INDEX "support_attachments_expires_at_message_id_idx" ON "support_attachments"("expires_at", "message_id");

-- CreateIndex
CREATE INDEX "support_ticket_activities_ticket_id_created_at_id_idx" ON "support_ticket_activities"("ticket_id", "created_at", "id");

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_attachments" ADD CONSTRAINT "support_attachments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_attachments" ADD CONSTRAINT "support_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "support_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_read_states" ADD CONSTRAINT "support_read_states_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_read_states" ADD CONSTRAINT "support_read_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_activities" ADD CONSTRAINT "support_ticket_activities_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_activities" ADD CONSTRAINT "support_ticket_activities_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Partial unique constraints are intentionally SQL-owned (Prisma has no predicate syntax).
CREATE UNIQUE INDEX support_one_active_general ON support_tickets(customer_id, branch_id)
WHERE type = 'GENERAL' AND status IN ('OPEN', 'IN_PROGRESS');
CREATE UNIQUE INDEX support_one_active_order ON support_tickets(customer_id, order_id)
WHERE type = 'ORDER' AND status IN ('OPEN', 'IN_PROGRESS');

ALTER TABLE support_tickets ADD CONSTRAINT support_ticket_context CHECK (
  (type = 'GENERAL' AND order_id IS NULL) OR (type = 'ORDER' AND order_id IS NOT NULL)
), ADD CONSTRAINT support_ticket_assignment CHECK (
  (status = 'OPEN' AND assignee_id IS NULL) OR
  (status = 'IN_PROGRESS' AND assignee_id IS NOT NULL) OR status = 'RESOLVED'
), ADD CONSTRAINT support_ticket_cursors CHECK (last_sequence >= 0 AND assignee_read_sequence >= 0 AND assignee_read_sequence <= last_sequence);
ALTER TABLE support_messages ADD CONSTRAINT support_message_bounds CHECK (sequence > 0 AND (text IS NULL OR char_length(text) BETWEEN 1 AND 4000));
ALTER TABLE support_attachments ADD CONSTRAINT support_file_size CHECK (size BETWEEN 1 AND 10485760);
ALTER TABLE support_read_states ADD CONSTRAINT support_read_bounds CHECK (last_read_sequence >= 0);

CREATE FUNCTION support_ticket_context_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.customer_id, NEW.branch_id, NEW.type, NEW.order_id) IS DISTINCT FROM (OLD.customer_id, OLD.branch_id, OLD.type, OLD.order_id) THEN
    RAISE EXCEPTION 'Support scope is immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.type = 'ORDER' AND NOT EXISTS (
    SELECT 1 FROM orders WHERE id = NEW.order_id AND user_id = NEW.customer_id AND branch_id = NEW.branch_id
  ) THEN RAISE EXCEPTION 'Support order scope mismatch' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER support_ticket_context_guard BEFORE INSERT OR UPDATE ON support_tickets FOR EACH ROW EXECUTE FUNCTION support_ticket_context_guard();

CREATE FUNCTION support_ticket_nonempty_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM support_messages WHERE ticket_id = NEW.id) THEN
    RAISE EXCEPTION 'Support ticket requires its first message' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER support_ticket_nonempty_guard AFTER INSERT ON support_tickets
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION support_ticket_nonempty_guard();

CREATE FUNCTION support_read_monotonic_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.last_read_sequence < OLD.last_read_sequence THEN
    RAISE EXCEPTION 'Support read cursor cannot decrease' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER support_read_monotonic_guard BEFORE UPDATE ON support_read_states FOR EACH ROW EXECUTE FUNCTION support_read_monotonic_guard();

-- Add only Support grants to the existing Branch Admin role. No staff/global grants.
INSERT INTO permissions(id, code, name, resource, action, guard_name, created_at, updated_at) VALUES
('01JZ0000000000000000000101', 'support.read', 'Xem hội thoại hỗ trợ', 'support', 'read', 'web', now(), now()),
('01JZ0000000000000000000102', 'support.claim', 'Tiếp nhận hỗ trợ', 'support', 'claim', 'web', now(), now()),
('01JZ0000000000000000000103', 'support.reply', 'Trả lời hỗ trợ', 'support', 'reply', 'web', now(), now()),
('01JZ0000000000000000000104', 'support.manage', 'Quản lý hỗ trợ', 'support', 'manage', 'web', now(), now())
ON CONFLICT (code) DO NOTHING;
INSERT INTO role_permissions(role_id, permission_id, assigned_at)
SELECT r.id, p.id, now() FROM roles r CROSS JOIN permissions p
WHERE r.code = 'BRANCH_ADMIN' AND r.type = 'BRANCH' AND p.code IN ('support.read', 'support.claim', 'support.reply', 'support.manage')
ON CONFLICT (role_id, permission_id) DO NOTHING;


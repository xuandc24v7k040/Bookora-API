ALTER TABLE "support_messages" ADD COLUMN "reply_to_message_id" TEXT;
CREATE INDEX "support_messages_reply_to_message_id_idx" ON "support_messages"("reply_to_message_id");
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_reply_to_message_id_fkey"
  FOREIGN KEY ("reply_to_message_id") REFERENCES "support_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Defense in depth: a quote may never reference another ticket, including direct SQL writes.
CREATE FUNCTION support_reply_same_ticket() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.reply_to_message_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM support_messages WHERE id = NEW.reply_to_message_id AND ticket_id = NEW.ticket_id
  ) THEN
    RAISE EXCEPTION 'Support reply must reference the same ticket' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER support_reply_same_ticket BEFORE INSERT OR UPDATE OF reply_to_message_id, ticket_id
  ON support_messages FOR EACH ROW EXECUTE FUNCTION support_reply_same_ticket();

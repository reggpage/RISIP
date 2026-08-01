-- Manual receipt entries (fallback for receipts AI can't read or when a physical photo
-- isn't handy) don't have an image. Storage upload becomes optional; the trigger on
-- receipts_set_company_id still runs off project_id so tenant scoping is preserved.
alter table receipts alter column image_url drop not null;

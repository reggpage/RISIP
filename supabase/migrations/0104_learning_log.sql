-- Keeping the question, so the failures can be found without a screenshot.
--
-- Every answer-quality defect fixed in this project so far was found the same
-- way: the owner noticed it, screenshotted it, and sent it over. That does not
-- scale past one shop, and it only ever catches the failures somebody happened
-- to be looking at.
--
-- The audit log already records what Risip DID with each message (intent,
-- action, outcome). What it never kept is what the message SAID, so there was no
-- way to ask the one question that matters: what were people asking that we
-- answered badly?
--
-- Two additions:
--   message_text  — the inbound message, with anything phone-shaped masked
--   claimed_by    — which parser took it, or 'conversational_ai' when no
--                   deterministic route recognised it at all
--
-- That second column is the real signal. A message the AI had to improvise an
-- answer for is a message the system does not properly understand yet, and the
-- list of them is the work queue.

alter table public.whatsapp_audit_log
  add column if not exists message_text text,
  add column if not exists claimed_by text;

comment on column public.whatsapp_audit_log.message_text is
  'Inbound text, phone-shaped digit runs masked. Never a media caption from an unlinked number.';
comment on column public.whatsapp_audit_log.claimed_by is
  'The parser that handled the message. conversational_ai means nothing deterministic matched.';

create index if not exists whatsapp_audit_log_learning
  on public.whatsapp_audit_log (company_id, created_at desc)
  where message_text is not null;

/**
 * Mask anything phone-shaped before it is stored.
 *
 * A run of 9+ digits in a WhatsApp message is a phone number far more often
 * than it is a price — TZS prices in this shop run to five figures. Money is
 * the thing worth keeping, so the cut is set above it.
 */
create or replace function private.mask_message_text(p_text text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_text is null then null
    else left(regexp_replace(regexp_replace(p_text, '\+?\d[\d\s-]{8,}\d', '[namba]', 'g'),
                             '\s+', ' ', 'g'), 2000)
  end;
$$;

revoke all on function private.mask_message_text(text) from public, anon, authenticated;

/**
 * What the shop asked that Risip did not properly understand.
 *
 * Anything a deterministic parser claimed and applied is working as intended and
 * is not interesting here. What is left is the queue: questions that fell
 * through to the model, clarifications it had to ask for, and outright failures.
 */
create or replace view public.whatsapp_learning_gaps as
  select
    l.company_id,
    l.created_at,
    l.intent,
    l.claimed_by,
    l.outcome,
    l.message_text
  from public.whatsapp_audit_log l
  where l.message_text is not null
    and (
      l.claimed_by = 'conversational_ai'
      or l.outcome in ('clarification', 'failed', 'unknown', 'blocked')
    )
  order by l.created_at desc;

revoke all on public.whatsapp_learning_gaps from public, anon;
grant select on public.whatsapp_learning_gaps to service_role;

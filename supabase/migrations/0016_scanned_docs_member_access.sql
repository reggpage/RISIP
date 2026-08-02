-- Batch upload for staff: let any project member (not just finance) create + read
-- scanned_documents for projects they can see. The receipts themselves are still
-- inserted under receipts_insert_own (uploaded_by = auth.uid()).
create policy scanned_docs_member_insert on scanned_documents
  for insert to authenticated
  with check (created_by = auth.uid() and private.auth_can_see_project(project_id));

create policy scanned_docs_member_select on scanned_documents
  for select to authenticated
  using (private.auth_can_see_project(project_id));

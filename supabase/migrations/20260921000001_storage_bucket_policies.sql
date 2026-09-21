-- RLS policies for the snapflow-public-bucket storage bucket.
-- `supabase seed buckets` only creates the bucket row, not object-level policies,
-- so authenticated uploads were rejected by the default-deny RLS on storage.objects.

create policy "snapflow_public_bucket_select"
on storage.objects for select
to authenticated
using (bucket_id = 'snapflow-public-bucket');

create policy "snapflow_public_bucket_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'snapflow-public-bucket');

create policy "snapflow_public_bucket_update"
on storage.objects for update
to authenticated
using (bucket_id = 'snapflow-public-bucket')
with check (bucket_id = 'snapflow-public-bucket');

create policy "snapflow_public_bucket_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'snapflow-public-bucket');

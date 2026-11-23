-- Trạm Job Đua Thuyền TGHV
-- Chạy toàn bộ file này trong Supabase > SQL Editor > New query.
-- Sau khi tạo tài khoản đầu tiên, đổi role của tài khoản đó thành admin bằng câu UPDATE ở cuối file.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'member' check (role in ('member','admin')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  posted_by uuid not null references public.profiles(id),
  title text not null,
  description text not null,
  total_slots integer not null check (total_slots > 0),
  filled_slots integer not null default 0 check (filled_slots >= 0),
  status text not null default 'OPEN' check (status in ('OPEN','DONE')),
  created_at timestamptz not null default now()
);

create table if not exists public.job_contacts (
  job_id uuid primary key references public.jobs(id) on delete cascade,
  owner_id uuid not null references public.profiles(id),
  phone text,
  zalo text,
  created_at timestamptz not null default now()
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  applicant_id uuid not null references public.profiles(id),
  status text not null default 'applied' check (status in ('applied','accepted','rejected')),
  created_at timestamptz not null default now(),
  unique(job_id, applicant_id)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  payer_id uuid not null references public.profiles(id),
  fee_side text not null check (fee_side in ('poster','receiver')),
  amount integer not null default 1000 check (amount = 1000),
  proof_path text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique(job_id, payer_id, fee_side)
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;

create or replace function public.is_approved_member()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id = auth.uid() and status = 'approved') $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name',''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Xác nhận nhận Slot theo transaction: không thể nhận quá tổng Slot.
create or replace function public.accept_job_application(p_application_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_job public.jobs; v_app public.applications;
begin
  select * into v_app from public.applications where id = p_application_id for update;
  if not found then raise exception 'Không tìm thấy yêu cầu nhận Job'; end if;
  select * into v_job from public.jobs where id = v_app.job_id for update;
  if v_job.posted_by <> auth.uid() and not public.is_admin() then raise exception 'Bạn không có quyền xác nhận yêu cầu này'; end if;
  if not public.is_approved_member() and not public.is_admin() then raise exception 'Tài khoản chưa được duyệt'; end if;
  if v_app.status <> 'applied' then raise exception 'Yêu cầu này đã được xử lý'; end if;
  if v_job.status <> 'OPEN' or v_job.filled_slots >= v_job.total_slots then raise exception 'Job đã đủ Slot'; end if;
  update public.applications set status='accepted' where id=p_application_id;
  update public.jobs set filled_slots=filled_slots+1,
    status=case when filled_slots+1 >= total_slots then 'DONE' else 'OPEN' end
    where id=v_job.id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.job_contacts enable row level security;
alter table public.applications enable row level security;
alter table public.payments enable row level security;

-- Profiles: thành viên xem hồ sơ của mình; Admin xem toàn bộ.
drop policy if exists "profile read self or admin" on public.profiles;
create policy "profile read self or admin" on public.profiles for select to authenticated
using (id=auth.uid() or public.is_admin());
drop policy if exists "profile update admin only" on public.profiles;
create policy "profile update admin only" on public.profiles for update to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Jobs: thành viên đã duyệt được xem; chỉ chủ Job hoặc Admin được sửa.
drop policy if exists "approved members read jobs" on public.jobs;
create policy "approved members read jobs" on public.jobs for select to authenticated
using (public.is_approved_member() or public.is_admin());
drop policy if exists "approved members create jobs" on public.jobs;
create policy "approved members create jobs" on public.jobs for insert to authenticated
with check (posted_by=auth.uid() and public.is_approved_member());
drop policy if exists "owner or admin update jobs" on public.jobs;
create policy "owner or admin update jobs" on public.jobs for update to authenticated
using (posted_by=auth.uid() or public.is_admin())
with check (posted_by=auth.uid() or public.is_admin());

-- Contact is a separate protected table. Only the job owner or an accepted applicant
-- can read it AFTER both sides' 1,000đ payments have been approved.
drop policy if exists "owner insert contact" on public.job_contacts;
create policy "owner insert contact" on public.job_contacts for insert to authenticated
with check (owner_id=auth.uid() and exists(select 1 from public.jobs j where j.id=job_id and j.posted_by=auth.uid()));
drop policy if exists "matched parties read contact" on public.job_contacts;
create policy "matched parties read contact" on public.job_contacts for select to authenticated
using (
  (
    owner_id=auth.uid() and exists (
      select 1 from public.applications a
      join public.payments receiver_pay on receiver_pay.job_id=a.job_id and receiver_pay.payer_id=a.applicant_id and receiver_pay.fee_side='receiver' and receiver_pay.status='approved'
      join public.payments poster_pay on poster_pay.job_id=a.job_id and poster_pay.payer_id=job_contacts.owner_id and poster_pay.fee_side='poster' and poster_pay.status='approved'
      where a.job_id=job_contacts.job_id and a.status='accepted'
    )
  ) or exists (
    select 1 from public.applications a
    join public.payments receiver_pay on receiver_pay.job_id=a.job_id and receiver_pay.payer_id=a.applicant_id and receiver_pay.fee_side='receiver' and receiver_pay.status='approved'
    join public.payments poster_pay on poster_pay.job_id=a.job_id and poster_pay.payer_id=job_contacts.owner_id and poster_pay.fee_side='poster' and poster_pay.status='approved'
    where a.job_id=job_contacts.job_id and a.applicant_id=auth.uid() and a.status='accepted'
  )
);

-- Applications
drop policy if exists "read own or related applications" on public.applications;
create policy "read own or related applications" on public.applications for select to authenticated
using (applicant_id=auth.uid() or exists(select 1 from public.jobs j where j.id=job_id and j.posted_by=auth.uid()) or public.is_admin());
drop policy if exists "approved members apply" on public.applications;
create policy "approved members apply" on public.applications for insert to authenticated
with check (applicant_id=auth.uid() and public.is_approved_member() and exists(select 1 from public.jobs j where j.id=job_id and j.status='OPEN' and j.posted_by<>auth.uid()));
drop policy if exists "owner or admin update applications" on public.applications;
create policy "owner or admin update applications" on public.applications for update to authenticated
using (exists(select 1 from public.jobs j where j.id=job_id and j.posted_by=auth.uid()) or public.is_admin())
with check (exists(select 1 from public.jobs j where j.id=job_id and j.posted_by=auth.uid()) or public.is_admin());

-- Payments
drop policy if exists "read own or admin payments" on public.payments;
create policy "read own or admin payments" on public.payments for select to authenticated
using (payer_id=auth.uid() or public.is_admin());
drop policy if exists "approved members submit payment" on public.payments;
create policy "approved members submit payment" on public.payments for insert to authenticated
with check (
  payer_id=auth.uid() and public.is_approved_member() and amount=1000 and status='pending'
  and (
    (fee_side='poster' and exists(select 1 from public.jobs j where j.id=job_id and j.posted_by=auth.uid()))
    or
    (fee_side='receiver' and exists(select 1 from public.applications a where a.job_id=job_id and a.applicant_id=auth.uid() and a.status='accepted'))
  )
);
drop policy if exists "admin review payments" on public.payments;
create policy "admin review payments" on public.payments for update to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Storage bucket for transfer proof images.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('payment-proofs','payment-proofs',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "members upload own proofs" on storage.objects;
create policy "members upload own proofs" on storage.objects for insert to authenticated
with check (bucket_id='payment-proofs' and (storage.foldername(name))[1]=auth.uid()::text and public.is_approved_member());
drop policy if exists "owner or admin read proofs" on storage.objects;
create policy "owner or admin read proofs" on storage.objects for select to authenticated
using (bucket_id='payment-proofs' and (public.is_admin() or (storage.foldername(name))[1]=auth.uid()::text));

-- 1) Đăng ký tài khoản đầu tiên trên website.
-- 2) Lấy UUID tài khoản từ Authentication > Users.
-- 3) Chạy câu lệnh dưới đây, thay YOUR-USER-UUID bằng UUID đó:
-- update public.profiles set role='admin', status='approved' where id='YOUR-USER-UUID';

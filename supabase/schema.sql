-- 3선탄 통합관리 — Supabase 스키마
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 [Run] 하세요.
-- (한 번만 실행. 다시 실행해도 안전하도록 IF NOT EXISTS 사용)
--
-- 설계: 현장모드에서 자주/동시에 쓰는 데이터(점검기록·일정)는 행 단위 테이블로
-- 분리해 덮어쓰기를 방지하고, 관리자만 가끔 바꾸는 설정(벨트목록·점검자·비밀번호)은
-- 순서 보존을 위해 settings의 'config' 한 행에 JSON으로 보관한다.

-- 설정값: key='config' 한 행에 { groups, inspectors, adminPw } JSON 저장
create table if not exists public.settings (
  key   text primary key,
  value jsonb not null default '{}'::jsonb
);

-- 점검 기록 (id = "벨트명__날짜")
create table if not exists public.records (
  id        text primary key,
  belt      text not null,
  grp       text,
  date      text not null,
  inspector text,
  items     jsonb not null default '{}'::jsonb
);

-- 벨트별 점검 일정
create table if not exists public.schedules (
  belt      text primary key,
  next_date text,
  cycle     text
);

-- ===== RLS (행 수준 보안) =====
-- 내부용 도구이므로 publishable(anon) 키로 읽기/쓰기를 모두 허용한다.
alter table public.settings  enable row level security;
alter table public.records   enable row level security;
alter table public.schedules enable row level security;

do $$
declare t text;
begin
  foreach t in array array['settings','records','schedules']
  loop
    execute format('drop policy if exists "anon_all" on public.%I;', t);
    execute format(
      'create policy "anon_all" on public.%I for all to anon using (true) with check (true);',
      t
    );
  end loop;
end$$;

-- ===== 실시간(Realtime) 활성화 =====
-- 다른 기기의 변경을 즉시 받아보기 위해 publication에 테이블 추가.
do $$
declare t text;
begin
  foreach t in array array['settings','records','schedules']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I;', t);
    exception when duplicate_object then
      null; -- 이미 추가된 경우 무시
    end;
  end loop;
end$$;

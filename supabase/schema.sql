-- SkinStack 상품·성분·루틴 스키마 (Supabase / PostgreSQL)
-- 적용: Supabase 대시보드 > SQL Editor 에 붙여넣고 실행.
-- 상품/성분은 누구나 읽기, 쓰기는 관리자(service_role)만. 개인 루틴·기록은 본인만(RLS).

-- ---------- 성분 (상품마다 중복 저장하지 않음) ----------
create table if not exists ingredients (
  id               text primary key,             -- 표준명 slug (예: '1-2-hexanediol')
  inci             text not null,                -- 표준 INCI 영문명
  name_ko          text,                         -- 한글 표준 성분명 (확인된 경우만)
  aliases          text[] not null default '{}', -- 라벨 표기 변형 (예: 'Aqua/Water')
  functions        text[] not null default '{}', -- 일반 기능
  molecular_weight numeric,                      -- PubChem 단일 화합물 값. 고분자·혼합물은 null
  xlogp            numeric,                      -- 지용성 지표(추정)
  solubility_note  text,
  cautions         text,
  sources          text[] not null default '{}', -- 근거 URL
  confidence       text not null default 'unverified' check (confidence in ('verified', 'reference', 'unverified')),
  updated_at       timestamptz not null default now()
);

-- ---------- 상품 ----------
create table if not exists products (
  id                   text primary key,
  brand                text not null,
  brand_ko             text,
  name                 text not null,
  volume               text,                     -- 용량·단위 원문 (미확인이면 null)
  category             text not null,
  texture              text,                     -- 제형 (미확인이면 null)
  ingredients_raw      text,                     -- 전성분 원문
  key_ingredients      text[] not null default '{}',
  purpose              text,                     -- 제조사 설명
  manufacturer         text,
  usage_official       text,                     -- 공식 사용 방법 원문
  time_of_use          text check (time_of_use in ('am', 'pm', 'both')),
  official_order       jsonb,                    -- {after:[], before:[], first, last, quote}
  cautions_official    text[] not null default '{}',
  interaction_notes    jsonb not null default '[]', -- [{group, level, source}]
  image_url            text,                     -- Storage URL (권한 확인된 이미지만)
  image_status         text not null default 'none',
  source_url           text not null,            -- 전성분·제품 정보 출처
  verified_at          date,
  verification_status  text not null default 'unverified' check (verification_status in ('official_verified', 'partial', 'unverified')),
  updated_at           timestamptz not null default now()
);

-- 상품 ↔ 성분 다대다 (전성분 순서 보존)
create table if not exists product_ingredients (
  product_id    text not null references products(id) on delete cascade,
  ingredient_id text not null references ingredients(id),
  position      int  not null,
  label_text    text,                            -- 라벨에 적힌 그대로 (예: 'Niacinamide(15%)')
  primary key (product_id, position)
);
create index if not exists idx_pi_ingredient on product_ingredients(ingredient_id);

-- ---------- 개인 루틴 (상품 DB와 분리, 본인만 접근) ----------
create table if not exists routines (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  slot       text not null check (slot in ('am', 'pm')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists routine_items (
  routine_id     uuid not null references routines(id) on delete cascade,
  position       int  not null,
  product_id     text references products(id),   -- 상품 DB 제품
  custom_product jsonb,                          -- 상품 DB에 없는, 사용자가 직접 입력한 제품
  amount         text,
  memo           text,
  primary key (routine_id, position)
);
create table if not exists routine_versions (     -- 수정 전후 비교
  id         uuid primary key default gen_random_uuid(),
  routine_id uuid not null references routines(id) on delete cascade,
  items      jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists routine_logs (         -- 사용자가 직접 쓴 기록 (앱 분석과 별도)
  id            uuid primary key default gen_random_uuid(),
  routine_id    uuid not null references routines(id) on delete cascade,
  log_date      date not null,
  period        text,
  good          text,
  bad           text,
  reaction      text,
  satisfaction  int check (satisfaction between 1 and 5),
  keep          text check (keep in ('yes', 'no', 'undecided')),
  product_memos jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

-- ---------- 기기 간 동기화 (앱이 실제로 사용하는 테이블) ----------
-- 사용자별 앱 데이터 한 덩어리(화장대·내 루틴·기록·마스크팩). 피부 정보(임신·수유 등)는 저장하지 않음.
create table if not exists user_state (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
alter table user_state enable row level security;
create policy "own state" on user_state for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- 권한 (RLS) ----------
alter table ingredients enable row level security;
alter table products enable row level security;
alter table product_ingredients enable row level security;
alter table routines enable row level security;
alter table routine_items enable row level security;
alter table routine_versions enable row level security;
alter table routine_logs enable row level security;

create policy "public read ingredients" on ingredients for select using (true);
create policy "public read products" on products for select using (true);
create policy "public read product_ingredients" on product_ingredients for select using (true);
-- 상품/성분 쓰기 정책은 만들지 않음 → anon/authenticated 는 쓰기 불가, 관리자는 service_role 키로만 반영

create policy "own routines" on routines for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own routine items" on routine_items for all
  using (exists (select 1 from routines r where r.id = routine_id and r.user_id = auth.uid()))
  with check (exists (select 1 from routines r where r.id = routine_id and r.user_id = auth.uid()));
create policy "own routine versions" on routine_versions for all
  using (exists (select 1 from routines r where r.id = routine_id and r.user_id = auth.uid()))
  with check (exists (select 1 from routines r where r.id = routine_id and r.user_id = auth.uid()));
create policy "own routine logs" on routine_logs for all
  using (exists (select 1 from routines r where r.id = routine_id and r.user_id = auth.uid()))
  with check (exists (select 1 from routines r where r.id = routine_id and r.user_id = auth.uid()));

-- ---------- 상품 이미지 저장소 (공개 읽기, 업로드는 관리자만) ----------
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true)
  on conflict (id) do nothing;

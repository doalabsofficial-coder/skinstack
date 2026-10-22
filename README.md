# 스킨스택 (SkinStack)

가지고 있는 **기초 스킨케어 제품(클렌저 ~ 크림, 선크림까지)** 으로 아침·저녁, 요일별 루틴을 만들어 주는 모바일 우선 웹앱입니다.
새 제품 구매를 유도하기보다 이미 가진 제품을 안전하고 알뜰하게 쓰도록 돕습니다. 메이크업은 지원 대상이 아닙니다.

## 실행 방법

필요: **Node.js 22.13 이상** (Node 24 권장). 별도 설치(`npm install`) 없이 실행됩니다.

```bash
cp .env.example .env      # Windows: copy .env.example .env
# .env 에서 ADMIN_PASSWORD 를 설정 (관리자 화면을 쓰려면 필수)
npm start                 # http://localhost:3000
npm test                  # 루틴·조합·중복·라벨 파서 단위 테스트
```

- 개발 중 자동 재시작: `npm run dev`
- 서버 사진 인식(Claude 비전)을 쓰려면 `npm install` 후 `.env` 에 `ANTHROPIC_API_KEY` 를 넣으세요. 설정하지 않으면 브라우저 안에서 무료 OCR(Tesseract.js)이 동작합니다.
- 데이터 파일은 `data/` 에 생성됩니다(SQLite, 업로드 사진). 처음 실행 시 예시 제품 14개가 "접수됨" 상태의 등록 요청으로 들어가 관리자 검토 흐름을 볼 수 있습니다(`SEED_DEMO=false` 로 끌 수 있음).

## GitHub Pages로 바로 써 보기 (서버 없이)

1. 저장소에 `docs/`, `server/`, `tests/`, `scripts/`, `supabase/`, `package.json`, `README.md`, `.env.example`, `.gitignore` 를 올립니다. (`.env`, `data/`, zip 파일은 올리지 마세요)
2. 저장소 **Settings → Pages → Build and deployment**: Source `Deploy from a branch`, Branch `main` / 폴더 **`/docs`** → Save
3. 1~2분 뒤 `https://아이디.github.io/저장소이름/` 접속

Pages에서는 서버가 없으므로 **루틴·화장대·마스크팩·사진 인식(브라우저 OCR)** 만 동작합니다. 제품 검색(관리자+고객 누적 데이터)·등록 요청·관리자 화면·제휴 링크는 `npm start` 로 서버를 실행한 환경(내 PC, Codespaces, Render 등)에서만 동작합니다.

## 기술 스택과 선택 이유

| 영역 | 선택 | 이유 |
|---|---|---|
| 서버 | Node 내장 `http` + 내장 `node:sqlite` | 의존성 없이 바로 실행, 관리자 권한을 서버에서 검증 |
| 화면 | 빌드 없는 Vanilla ES Modules SPA | 설치·빌드 단계 없음. 나중에 React/앱으로 옮겨도 `docs/js/domain/` 로직은 그대로 재사용 |
| 사진 인식 | Claude 비전(선택) → 없으면 Tesseract.js | 키가 없어도 동작, 있으면 앞·뒤 라벨을 구조화해 추출 |
| 다국어 | `docs/i18n/{ko,en}.json` | 문구를 코드에 흩지 않고 리소스로 관리 |

## 구조

```
server/
  server.js      라우트, 정적 파일, 보안 헤더(CSP)
  auth.js        익명 사용자 토큰(HMAC), 관리자 세션(HttpOnly 쿠키, 서버 검증)
  affiliate.js   지역별 제휴 링크(쿠팡 파트너스 딥링크 API, 아마존 태그), 링크 상태 확인
  ocr.js         라벨 사진 → 텍스트 구조화 (보이는 글자만, 추측 금지)
  db.js          SQLite 스키마: catalog_products, product_requests, affiliate_links, admin_sessions
docs/
  i18n/          번역 리소스 (앱 이름: app.name)
  js/domain/     화면과 무관한 순수 로직 (테스트 대상)
    categories.js  지원 카테고리, 바르는 순서, 메이크업 감지
    ingredients.js 성분 키워드 사전(한/영 INCI), 근거(전성분/제품명) 구분
    product.js     제품 모델, 루틴 포함 가능 여부(제외 사유)
    routine.js     아침·저녁·요일별 루틴 생성
    interactions.js 함께 쓸 때 확인할 조합 / 함께 고려할 수 있는 조합
    duplicates.js  비슷한 제품 비교
    parse.js       OCR 텍스트 → 전성분·사용법·주의사항 분리
  js/views/      화면 9종
tests/           node:test 단위 테스트
```

### 데이터 저장 위치
- **기기(localStorage)**: 보유 제품, 피부 정보, 마스크팩 계획, 사용 기록, 구매 목록. 피부·임신/수유 정보는 서버로 보내지 않습니다. 설정 화면에서 백업 내보내기/가져오기를 할 수 있습니다.
- **서버(SQLite)**: 승인된 제품 카탈로그, 고객 누적 입력 제품(`community_products`), 등록 요청과 처리 이력, 제휴 링크와 확인 상태.

### 제품 검색 = 관리자 승인 제품 + 고객 누적 입력
- 사용자가 "라벨과 대조해 확인"하고 저장한 제품은 브랜드·제품명·종류·용량·전성분·사용법만 서버에 누적됩니다(피부 정보·사용 기록은 보내지 않음, 설정에서 끌 수 있음).
- 같은 브랜드+제품명은 하나로 합쳐 입력한 사용자 수를 세고, 비어 있는 항목만 나중 입력으로 채웁니다.
- 검색 결과는 승인 제품이 먼저 나오고, 고객 입력은 "사용자 입력 · n명"으로 구분됩니다. 고른 뒤에도 사용자가 라벨과 확인해야 저장됩니다.
- 관리자 화면 > 고객 입력 탭에서 부적절한 항목을 숨길 수 있습니다.

## 상품 DB (검증된 제품부터 단계적으로)

- 데이터: `docs/data/products.json`(상품), `docs/data/ingredients.json`(성분 표 · 상품과 다대다는 `ingredientIds` 순서 배열)
- 현재 **22개**: COSRX 16 · Torriden 6 (클렌저·토너·패드·에센스·세럼·크림·페이스 오일·선크림·마스크)
- 전성분·공식 사용법·용량·사용기한은 **브랜드 공식 글로벌 몰 원문을 스크립트로 그대로 추출**합니다(손으로 옮겨 적지 않음). 국내(올리브영) 판매 제품은 처방·용량이 다를 수 있다고 화면에 표시합니다.
- 분자량·지용성 지표(XLogP)는 **PubChem** 단일 화합물 자료만 사용하고, 고분자·추출물·혼합물은 "자료 부족"으로 둡니다. 분자량은 순서 판단에 쓰지 않습니다.
- 상품 이미지는 사용 권한을 확인하지 못해 **수집하지 않았고**, 기본 이미지를 보여 줍니다(`imageUrl: null`).
- 상품 추가: `scripts/catalog-sources.json` 에 공식 URL을 넣고 `npm run build:catalog`. 사용 시간·빈도·순서·병용 주의는 공식 문장(`quote`)이 있을 때만 입력합니다.

## 사용자 루틴과 분석

- 제품(상품 DB) 또는 화장대 제품으로 아침/저녁 루틴을 만들고, 순서 변경·교체·삭제·복제·메모·사용량을 저장합니다.
- 분석 결과는 **장점 / 단점 / 주의 조합 / 추천 순서(이유) / 공식 사용법과 다른 순서 / 공식 사용 빈도**로 나오며, 근거를 `제조사 공식`·`전성분 확인`·`일반 순서 규칙`으로 구분합니다. 문제가 없으면 "그대로 사용 가능"으로 안내합니다.
- "함께 사용 금지"는 제조사 문장이 있는 경우에만 표시합니다(예: COSRX AHA/BHA 토너 — "Avoid using with other acids (AHAs / BHAs / Retinols & Vitamin C)").
- 내 기록(좋았던 점·불편한 점·피부 반응·기간·만족도·계속 사용 여부·제품별 메모)은 앱 분석과 분리되어 날짜별로 쌓이고, 버전 저장으로 수정 전후를 비교합니다.

## 데이터베이스 설계와 Supabase

- **Supabase는 이 프로젝트와 호환됩니다.** 정적 프런트(GitHub Pages)에서 공식 JS 클라이언트로 접속할 수 있고, Postgres + Storage(상품 이미지) + RLS(개인 루틴은 본인만)로 요구사항을 충족합니다.
- 스키마: [`supabase/schema.sql`](supabase/schema.sql) — `products`, `ingredients`, `product_ingredients`(다대다), `routines`, `routine_items`, `routine_versions`, `routine_logs`, RLS 정책, `product-images` 버킷.
- **기기 간 동기화 연결됨** (`docs/js/sync.js`, 프로젝트 `wgipwbowaugqhrtecqvp`). 설정 → "기기 간 동기화"에서 이메일 로그인 링크로 로그인하면 화장대·내 루틴·기록·마스크팩이 `user_state` 테이블에 저장되어 PC와 휴대폰에서 같아집니다. 피부 정보와 언어 설정은 기기에만 남습니다.
  - 코드에 있는 `sb_publishable_…` 키는 브라우저용 공개 키입니다(데이터는 RLS로 본인 행만 접근). `sb_secret_…`/service_role 키는 절대 코드에 넣지 마세요.
  - 더 최근에 저장된 쪽이 반영되고, 새 기기에서 처음 로그인하면 "클라우드 / 이 기기" 중 어떤 데이터를 쓸지 묻습니다.
- **Supabase 대시보드에서 1회 설정이 필요합니다.**
  1. SQL Editor에서 `supabase/schema.sql` 전체를 실행 (테이블·권한 생성)
  2. Authentication → URL Configuration → Redirect URLs에 앱 주소 추가: `http://localhost:3000/**`, `https://<아이디>.github.io/<저장소>/**`

## 화면
하단 메뉴: 주간 · 화장대 · **오늘(가운데)** · 마스크팩 · 설정

1. 온보딩 · 피부 정보(선택) 2. 오늘의 루틴(+하단 4개 섹션) 3. 주간 루틴 4. 화장대·구매 목록 5. 제품 추가(검색/사진/직접 입력)
6. 제품 상세·사용 기록 7. 마스크팩(재고 · 브랜드 선택 · 요일 계획 · 타이머 · 사용 완료 · 재구매) 8. 제품 등록 요청·처리 상태 9. 설정 10. 관리자 검토(`#/admin`)

## 안전 원칙 (코드에 반영된 규칙)
- 확인되지 않은 정보는 "정보 확인 필요"로 표시하며, 제품명으로 성분이나 효능을 만들어 내지 않습니다.
- 사용자가 **제품 종류를 확인하고 "라벨과 대조해 확인"** 한 제품만 루틴에 들어갑니다.
- 제약회사 제품(브랜드에 '제약'·'pharm' 포함) 또는 라벨에 의약품 표시가 있는 제품은 규제 분류를 확인하기 전까지 루틴에서 제외합니다. 의약품으로 분류하면 계속 제외합니다.
- 레티노이드·AHA/BHA 같은 자극 가능 성분은 **사용 빈도를 입력해야** 루틴에 포함되며, 서로 다른 요일로 나눠 배치합니다.
- 조합 표시 단계: 전성분에서 확인 → "주의가 필요할 수 있음", 제품명으로만 추정 → "제품 지침 확인 필요", **관리자가 출처를 등록한 경우에만** "함께 사용 금지". 성분 정보가 없으면 "판단 자료 없음"으로 알리며, 안전하다고 판정하지 않습니다.
- 중복 제품은 알리기만 하고 삭제하거나 사용을 금지하지 않습니다. 알림은 설정에서 끌 수 있습니다.

## 이름·문구·언어·지역 바꾸기
- 앱 이름: `docs/i18n/ko.json`, `en.json` 의 `app.name` (+ `docs/manifest.webmanifest`)
- 문구: 같은 파일의 해당 키를 수정
- 언어 추가: `docs/js/i18n.js` 의 `SUPPORTED` 에 코드를 추가하고 같은 키 구조의 JSON 파일을 만듭니다
- 지역·제휴처 추가: `server/config.js` 의 `REGIONS` 와 `server/affiliate.js` 의 `PROVIDERS`
- 성분 표기 추가(다른 언어 INCI): `docs/js/domain/ingredients.js` 의 정규식
- 색상: `docs/styles.css` 맨 위의 CSS 변수

## 제휴 링크 설정
코드에는 어떤 키도 들어 있지 않습니다. 모두 `.env` 로 설정합니다.

| 지역 | 방법 | 설정 |
|---|---|---|
| 대한민국 | 쿠팡 파트너스 Open API 딥링크 | `COUPANG_ACCESS_KEY`, `COUPANG_SECRET_KEY`, (선택) `COUPANG_SUB_ID` |
| 대한민국 | API 키 없이: 파트너스 사이트에서 만든 `https://link.coupang.com/...` 링크를 관리자 화면의 제품 "출처 URL"에 입력 | — |
| 미국 | 아마존 어소시에이트 태그 | `AMAZON_US_ASSOCIATE_TAG` |

- 사용자가 피드백에서 "다시 구매하고 싶어요"를 고른 경우에만 버튼이 나타나며, 항상 "광고 · 제휴 링크" 문구와 제휴 고지가 함께 표시됩니다.
- 상품 페이지 링크가 없으면 **검색 결과 페이지**로 연결합니다(특정 상품이 계속 판매 중이라고 가정하지 않기 위해서예요).
- 관리자 화면 > 제휴 링크에서 링크 상태를 확인할 수 있습니다. 쇼핑몰이 자동 요청을 막으면 "자동 확인 불가"로 표시됩니다.

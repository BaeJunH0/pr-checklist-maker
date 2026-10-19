# PR 체크리스트 생성기 (PR Checklist Builder)

> 🔗 **배포 URL: https://pr-checklist-maker.vercel.app/**

PR 유형과 조건부 작업만 고르면 **해당 PR에 꼭 필요한 체크리스트만** Markdown으로 조립해 주는 정적 웹앱입니다.
"지우는 템플릿"에서 "조립하는 템플릿"으로 — 기획 문서는 [PRD.md](./PRD.md)를 참고하세요.

![스크린샷](./docs/screenshot.png)

## 사용법

1. **PR 유형**을 하나 고릅니다 — `Feature` / `Refactor` / `Fix` / `Docs`
2. 해당되는 **조건부 작업**을 체크합니다 — `DB 스키마 변경` / `DB 데이터(Row) 변경` / `외부 API 호출` (Docs는 선택 불가)
3. **📋 복사**를 눌러 GitHub PR 본문에 붙여넣습니다. (또는 **⬇ .md 다운로드**)

선택 상태는 URL에 반영되므로 링크로 공유할 수 있습니다.

```
https://pr-checklist-maker.vercel.app/?type=fix&cond=db-schema,external-api
```

| 파라미터 | 값 |
|---|---|
| `type` | `feature` \| `refactor` \| `fix` \| `docs` |
| `cond` | `db-schema`, `db-data`, `external-api` 중 0개 이상 (쉼표 구분, 순서 무관) |

## 기능 충족 현황

| ID | 기능 | 우선순위 | 상태 |
|---|---|---|---|
| F-01 | PR 유형 선택 (라디오, 택1) | P0 | ✅ |
| F-02 | 조건부 작업 선택 (체크박스, 복수) | P0 | ✅ |
| F-03 | 체크리스트 생성 (공통 + 유형별 + 조건부) | P0 | ✅ |
| F-04 | 실시간 미리보기 (원문 / 렌더링 탭) | P0 | ✅ |
| F-05 | 복사하기 + "복사됨" 피드백 | P0 | ✅ |
| F-06 | `pr-checklist.md` 다운로드 | P1 | ✅ |
| F-07 | URL 쿼리스트링 상태 공유 | P1 | ✅ |
| F-08 | Docs 선택 시 조건부 비활성화 + 선택 해제 | P1 | ✅ |

## 완료 조건 충족 현황

검증 방식: 🧪 단위 테스트(`src/lib/generate.test.ts`) · 🖥 브라우저 수동 검증

| ID | 시나리오 | 상태 | 검증 |
|---|---|---|---|
| AC-01 | 유형 미선택 → 안내 문구, 복사/다운로드 비활성 | ✅ | 🧪 🖥 |
| AC-02 | `Feature`만 선택 → 공통 + Feature만 출력 | ✅ | 🧪 |
| AC-03 | `Fix` + `DB 데이터 변경` → 공통 → Fix → DB 데이터 순서 | ✅ | 🧪 |
| AC-04 | `Feature` + 조건부 3개 → 5개 섹션 고정 순서 | ✅ | 🧪 |
| AC-05 | 조건부 선택 후 해제 → 헤더 포함 즉시 제거 | ✅ | 🧪 🖥 |
| AC-06 | `Refactor` → `Fix` 변경 → 유형 섹션만 교체 | ✅ | 🧪 🖥 |
| AC-07 | `Docs` 선택 → 조건부 비활성 및 선택 해제 | ✅ | 🧪 🖥 |
| AC-08 | 복사 → 클립보드에 원문 복사, "복사됨" 표시 | ✅ | 🖥 |
| AC-09 | 다운로드 → `pr-checklist.md`, 미리보기와 동일 내용 | ✅ | 🖥 |
| AC-10 | `?type=fix&cond=db-schema,external-api` 접속 → 상태 복원 | ✅ | 🧪 🖥 |
| AC-11 | GitHub PR 본문 붙여넣기 → 체크박스 렌더링 | ✅ | 🧪 (`- [ ]` 문법 검증) |

**비기능**

| 항목 | 상태 | 비고 |
|---|---|---|
| 선택 변경 후 100ms 이내 갱신 | ✅ | 클라이언트 메모리 내 문자열 조립, 네트워크 없음 |
| 모바일(375px) 가로 스크롤 없음 | ✅ | ≤768px에서 1단 레이아웃, 375px에서 `scrollWidth = clientWidth` 확인 |
| 네트워크 요청 없이 동작 | ✅ | 외부 폰트·CDN·API 미사용, 정적 빌드 |

## 개발

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 생성 규칙 · URL 상태 · 렌더링 단위 테스트
npm run build    # dist/ 정적 빌드
```

### 구조

```
src/
├─ data/checklists.ts     # 체크리스트 원본 (항목 수정은 이 파일을 PR로)
├─ lib/generate.ts        # 선택값 정규화 + Markdown 생성
├─ lib/urlState.ts        # 쿼리스트링 ↔ 선택값
├─ lib/renderMarkdown.ts  # 미리보기용 경량 렌더러 (HTML 이스케이프)
└─ App.tsx                # UI
```

### 체크리스트 항목 수정

`src/data/checklists.ts`의 `items` 배열을 수정해 PR을 올리면 됩니다. 조건부 섹션의 출력 순서는 `CONDITIONS` 배열 순서를 따릅니다.

## 기술 스택

React 18 · TypeScript · Vite · Vitest · Vercel (정적 배포)

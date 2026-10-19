export type PrType = 'feature' | 'refactor' | 'fix' | 'docs';
export type Condition = 'db-schema' | 'db-data' | 'external-api';

export interface ChecklistSection {
  id: 'common' | PrType | Condition;
  title: string; // 출력 헤더 (예: "DB 스키마 변경")
  items: string[]; // 체크 항목 문구
}

export interface Option<T extends string> {
  id: T;
  label: string;
  description: string;
}

/** 라디오 노출 순서 */
export const PR_TYPES: Option<PrType>[] = [
  { id: 'feature', label: 'Feature', description: '새로운 기능을 추가하는 PR' },
  { id: 'refactor', label: 'Refactor', description: '동작 변경 없이 구조·코드 품질을 개선하는 PR' },
  { id: 'fix', label: 'Fix', description: '버그를 수정하는 PR' },
  { id: 'docs', label: 'Docs', description: '문서만 변경하는 PR (조건부 작업 선택 불가)' },
];

/** 조건부 섹션의 고정 출력 순서 (생성 규칙 3.1-1) */
export const CONDITIONS: Option<Condition>[] = [
  { id: 'db-schema', label: 'DB 스키마 변경', description: '테이블·컬럼·인덱스 등 DDL 변경이 포함됨' },
  { id: 'db-data', label: 'DB 데이터(Row) 변경', description: '운영 데이터 INSERT/UPDATE/DELETE 작업이 포함됨' },
  { id: 'external-api', label: '외부 API 호출', description: '외부 시스템(PG사, 은행, 타 서비스) 연동이 추가·변경됨' },
];

export const COMMON_SECTION: ChecklistSection = {
  id: 'common',
  title: '공통',
  items: [
    'PR 제목과 설명에 변경 목적과 관련 이슈 번호를 적었다',
    '로컬에서 빌드와 테스트가 통과했다',
    '불필요한 로그, 주석, 디버그 코드를 제거했다',
    '민감정보(키, 토큰, 개인정보)가 코드와 로그에 포함되지 않았다',
  ],
};

export const TYPE_SECTIONS: Record<PrType, ChecklistSection> = {
  feature: {
    id: 'feature',
    title: 'Feature',
    items: [
      '신규 기능에 대한 단위 테스트를 추가했다',
      '기획/요구사항의 완료조건을 모두 충족했다',
      '예외 및 에러 케이스 처리를 확인했다',
      '필요 시 기능 플래그 또는 단계적 배포 방안을 마련했다',
    ],
  },
  refactor: {
    id: 'refactor',
    title: 'Refactor',
    items: [
      '기존 동작(외부 인터페이스, 응답 형식)이 변경되지 않았다',
      '리팩토링 전후 테스트 결과가 동일하다',
      '성능 저하 여부를 확인했다',
      '기능 변경이 섞이지 않도록 PR 범위를 분리했다',
    ],
  },
  fix: {
    id: 'fix',
    title: 'Fix',
    items: [
      '버그 재현 절차와 원인을 PR 설명에 기록했다',
      '재발 방지 테스트를 추가했다',
      '동일 원인으로 영향받는 다른 지점을 확인했다',
      '운영 영향 범위와 핫픽스 배포 필요 여부를 판단했다',
    ],
  },
  docs: {
    id: 'docs',
    title: 'Docs',
    items: [
      '문서 내용이 현재 코드/동작과 일치한다',
      '링크, 코드 예시, 이미지가 정상 동작한다',
      '오탈자와 포맷(마크다운 렌더링)을 확인했다',
    ],
  },
};

export const CONDITION_SECTIONS: Record<Condition, ChecklistSection> = {
  'db-schema': {
    id: 'db-schema',
    title: 'DB 스키마 변경',
    items: [
      '마이그레이션 스크립트와 롤백 스크립트를 함께 작성했다',
      '대용량 테이블의 락/다운타임 영향을 검토했다',
      '인덱스 추가·변경에 따른 쿼리 성능을 확인했다',
      '배포 순서(스키마 → 애플리케이션)와 하위 호환성을 확인했다',
    ],
  },
  'db-data': {
    id: 'db-data',
    title: 'DB 데이터(Row) 변경',
    items: [
      '실행 전 대상 건수를 조회해 기록했다',
      '변경 전 데이터 백업 또는 원복 쿼리를 준비했다',
      'WHERE 조건을 검증하고 스테이징에서 먼저 실행했다',
      '트랜잭션 단위와 실행 시간대(트래픽 저점)를 결정했다',
    ],
  },
  'external-api': {
    id: 'external-api',
    title: '외부 API 호출',
    items: [
      '타임아웃과 재시도 정책을 설정했다',
      '외부 장애 시 폴백 또는 에러 처리 방안을 마련했다',
      '멱등성(중복 호출 방지)을 보장했다',
      '요청/응답 로그에서 민감정보를 마스킹했다',
      '인증 정보는 환경변수/시크릿으로 관리한다',
    ],
  },
};

# Orchestrator Agent 명세서

## 역할
전체 뉴스 큐레이션 파이프라인을 순차적으로 실행하고 각 단계의 결과를 다음 단계에 전달하며,
실행 로그를 Notion에 기록하는 오케스트레이터.

## 파이프라인 실행 순서
```
1. Collector → 2. 중복제거 → 3. Curator → 4. Notion → 5. Mailer → 6. Log
```

## 입력
- `PipelineConfig` — sources, recipients, curationCriteria 등

## 출력
- `PipelineResult` — 전체 파이프라인 실행 결과

## 핵심 로직

### 1. 실행 초기화
- 고유 `runId` 생성 (UUID v4)
- 시작 시간 기록
- Notion 로그 DB에 "started" 상태 기록

### 2. Collector 호출
- `CollectorAgent.run(sources)` 호출
- 결과: `CollectorResult`
- 실패 시: 에러 로깅 후 파이프라인 중단

### 3. 중복 제거
- URL 기반 중복 체크 (최근 7일 Notion DB 조회)
- 제목 유사도 기반 중복 체크 (Levenshtein distance ≤ 0.3)
- 중복 제거 후 남은 아이템만 다음 단계로 전달

### 4. Curator 호출
- `CuratorAgent.run(dedupedItems, curationCriteria)` 호출
- 결과: `CuratorResult`
- relevanceScore < minRelevanceScore 인 아이템 필터링

### 5. Notion 저장
- `NotionAgent.store(curatedItems)` 호출
- 결과: `NotionResult`

### 6. Mailer 발송
- `MailerAgent.send(curatedItems, recipients)` 호출
- 결과: `MailerResult`
- 뉴스가 0건이면 발송 스킵 (로그에 "no_items" 기록)

### 7. 실행 로그 기록
- Notion 로그 DB에 최종 상태 기록
- 각 단계별 처리 건수, 소요 시간, 에러 내역 포함

## 에러 처리 전략
- 각 에이전트 호출은 최대 3회 재시도 (exponential backoff: 1s, 2s, 4s)
- Collector 실패 → 파이프라인 중단 ("failed")
- Curator 실패 → 파이프라인 중단 ("failed")
- Notion 실패 → Mailer는 계속 진행, 상태 "partial"
- Mailer 실패 → 상태 "partial" (Notion 저장은 성공)

## 실행 트리거
- GitHub Actions Cron: 매주 월요일 09:00 KST
- 수동 실행: `npm run pipeline`
- API 엔드포인트: `POST /api/trigger`

## 구현 파일
- `src/agents/orchestrator/index.ts` — 메인 오케스트레이터
- `src/agents/orchestrator/dedup.ts` — 중복 제거 로직
- `src/agents/orchestrator/retry.ts` — 재시도 유틸리티
- `src/agents/orchestrator/logger.ts` — 파이프라인 로거

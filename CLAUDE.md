# KDIS News Curator - 고등교육 및 AI 뉴스 자동 큐레이션 서비스

## Project Overview
KDI대학원 교원·경영진 대상 고등교육/AI 뉴스 자동 수집→큐레이션→노션 저장→이메일 발송 서비스.
5개 전문 에이전트(Collector, Curator, Notion, Mailer, Orchestrator)가 협력하는 멀티에이전트 아키텍처.

## Tech Stack
- Runtime: Node.js + TypeScript (strict mode)
- AI: Claude API (Sonnet 4)
- DB: Notion API
- Email: Stibee API (primary) / Resend (backup)
- Deploy: Vercel Serverless + GitHub Actions Cron
- Test: Vitest
- Lint: ESLint + Prettier

## Pipeline Flow
```
[Cron Trigger] → Orchestrator → Collector → Dedup → Curator → Notion → Mailer → Log
```

## Key Rules
- 모든 코드는 TypeScript strict mode
- 각 에이전트는 독립적으로 테스트 가능해야 함
- 에이전트 간 통신은 src/shared/types.ts의 타입된 인터페이스를 통해서만 가능
- 에러 처리: 재시도 3회 + exponential backoff
- 모든 실행 결과는 Notion 로그 DB에 기록
- 환경변수: ANTHROPIC_API_KEY, NOTION_TOKEN, NOTION_DB_ID, NOTION_LOG_DB_ID, STIBEE_API_KEY, RESEND_API_KEY

## Agent Instructions
각 에이전트 구현 시 agent_instructions/ 디렉토리의 해당 파일을 참조할 것:
- `agent_instructions/collector.md` - 뉴스 수집 에이전트
- `agent_instructions/curator.md` - AI 큐레이션 에이전트
- `agent_instructions/notion.md` - 노션 저장 에이전트
- `agent_instructions/mailer.md` - 이메일 발송 에이전트
- `agent_instructions/orchestrator.md` - 파이프라인 오케스트레이터

## Development Methodology
Karpathy의 Agentic Engineering 방법론 적용:
- 전체 기능 단위로 위임 (매크로 액션)
- 테스트 통과까지 자율 반복 (하네스 패턴)
- 스펙 선행: 이 파일 + agent_instructions를 먼저 읽고 구현

## Commands
```bash
npm run dev          # 로컬 개발 서버
npm run build        # TypeScript 빌드
npm run test         # Vitest 테스트 실행
npm run test:watch   # 테스트 watch 모드
npm run lint         # ESLint 검사
npm run format       # Prettier 포맷팅
npm run pipeline     # 파이프라인 수동 실행
```

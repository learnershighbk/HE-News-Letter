# Curator Agent - AI 큐레이션 에이전트 구현 명세

## 1. 에이전트 개요

Curator Agent는 Collector Agent가 수집한 `NewsItem[]`을 Claude API(Sonnet 4)를 통해 KDI대학원의 관점에서 평가하고, 관련성 점수 부여, 카테고리 분류, 한/영 요약 생성, KDI 시사점 작성, 우선순위 태그 지정을 수행하는 에이전트이다. 비용 효율성을 위해 배치 처리를 적용한다.

**담당 파일 구조:**
```
src/agents/curator/
  ├── index.ts       # CuratorAgent 메인 클래스
  ├── prompts.ts     # System/User prompt 템플릿
  └── scorer.ts      # 점수 기반 필터링 및 우선순위 로직
```

---

## 2. Dependencies (npm packages)

```json
{
  "@anthropic-ai/sdk": "^0.39.0"
}
```

- `@anthropic-ai/sdk`: Anthropic Claude API 공식 SDK

환경변수:
- `ANTHROPIC_API_KEY`: Claude API 키 (필수)

---

## 3. Input/Output 타입

`src/shared/types.ts`에서 import하여 사용한다:

```typescript
// Input
import { NewsItem } from '../../shared/types';

// Output
import { CuratedNewsItem, CuratorResult, AgentError, NewsCategory, Priority } from '../../shared/types';
```

### Input
- `items: NewsItem[]` - Collector Agent에서 수집한 (중복 제거된) 원시 뉴스 아이템

### Output
- `CuratorResult`
  - `items: CuratedNewsItem[]` - 큐레이션 통과한 뉴스 아이템
  - `totalProcessed: number` - 총 처리 건수
  - `totalPassed: number` - 통과 건수 (relevanceScore >= 60)
  - `totalFiltered: number` - 필터링된 건수
  - `errors: AgentError[]` - 에러 목록

---

## 4. Claude API 연동

### 4.1 Anthropic SDK 초기화

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
```

### 4.2 모델 설정

| 항목 | 값 |
|------|-----|
| Model | `claude-sonnet-4-20250514` |
| Max Tokens | 4096 |
| Temperature | 0.3 (일관성 우선) |

---

## 5. Core Functions 구현

### 5.1 CuratorAgent 메인 클래스 (`index.ts`)

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { NewsItem, CuratedNewsItem, CuratorResult, AgentError } from '../../shared/types';
import { buildSystemPrompt, buildUserPrompt } from './prompts';
import { filterByRelevance, assignPriority } from './scorer';

export class CuratorAgent {
  private client: Anthropic;
  private model: string = 'claude-sonnet-4-20250514';

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * NewsItem 배열을 큐레이션한다.
   * 배치 단위(5개씩)로 Claude API를 호출하여 비용을 절감한다.
   * @param items 수집된 뉴스 아이템
   * @returns CuratorResult
   */
  async curate(items: NewsItem[]): Promise<CuratorResult>;

  /**
   * 배치 단위로 Claude API를 호출한다.
   * @param batch NewsItem[] (최대 5개)
   * @returns CuratedNewsItem[] (관련성 점수가 부여된 아이템)
   */
  private async curateBatch(batch: NewsItem[]): Promise<CuratedNewsItem[]>;

  /**
   * Claude API 응답을 파싱하여 CuratedNewsItem[]으로 변환한다.
   * JSON 파싱 실패 시 재시도.
   */
  private parseResponse(response: string, originalItems: NewsItem[]): CuratedNewsItem[];
}
```

### 5.2 프롬프트 템플릿 (`prompts.ts`)

```typescript
import { NewsItem, NewsCategory } from '../../shared/types';

/**
 * System prompt: KDI대학원 뉴스 큐레이터 역할을 정의한다.
 */
export function buildSystemPrompt(): string {
  return `당신은 KDI School of Public Policy and Management(한국개발연구원 국제정책대학원)의 고등교육 뉴스 큐레이터입니다.

KDI대학원은 공공정책·경제발전 분야의 국제 대학원으로, 전 세계에서 온 학생들이 공공정책, 공공관리, 개발정책 등을 공부합니다.
교원 약 30명, 학생 약 600명 규모이며, 영어로 수업하는 국제대학원입니다.
세종시 캠퍼스에 위치하며, 한국개발연구원(KDI)과 긴밀히 연계되어 있습니다.

## 판단 기준

아래 6개 카테고리 중 하나 이상에 해당하면 관련성이 높습니다:

1. **교육혁신 & 테크**: AI, EdTech, 온라인 학습, 평가 혁신, LMS, AI 튜터, adaptive learning
2. **정책 & 거버넌스**: 고등교육 정책, 규제, 재정 지원, 등록금 정책, 인증
3. **교수법 & 교원개발**: 사례교육, PBL, 액티브러닝, Faculty Development, pedagogy
4. **국제화 & 랭킹**: 대학 랭킹, 유학생 유치, 국제 협력, QS/THE ranking
5. **AI 윤리 & 가이드라인**: 대학 AI 정책, 학술 윤리, 표절, academic integrity
6. **학생 성공 & 취업**: 취업률, 커리어 지원, 학생 경험, alumni

## 응답 형식

반드시 아래 JSON 배열 형식으로 응답하세요. 다른 텍스트는 포함하지 마세요.

\`\`\`json
[
  {
    "id": "원본 뉴스의 id",
    "relevanceScore": 0-100,
    "categories": ["카테고리1", "카테고리2"],
    "summaryKo": "한국어 2-3문장 요약",
    "summaryEn": "English 1-sentence summary",
    "kdiInsight": "KDI대학원에 대한 시사점 1문장 (한국어)",
    "tags": ["태그1", "태그2", "태그3"]
  }
]
\`\`\`

## 점수 기준
- 90-100: KDI대학원에 직접적으로 영향을 미치는 핵심 뉴스
- 70-89: 교원/경영진이 알아두면 유익한 관련 뉴스
- 60-69: 참고할 만한 배경 정보
- 0-59: KDI대학원과 관련성이 낮음 (필터링 대상)`;
}

/**
 * User prompt: 뉴스 아이템 배치를 분석 요청한다.
 * @param items 분석할 뉴스 아이템 배치 (최대 5개)
 */
export function buildUserPrompt(items: NewsItem[]): string {
  const newsData = items.map((item, index) => ({
    id: item.id,
    title: item.title,
    source: item.source,
    language: item.language,
    category: item.category,
    publishedAt: item.publishedAt,
    content: item.content.substring(0, 500), // 비용 절감을 위해 500자 제한
  }));

  return `아래 ${items.length}개의 뉴스 기사를 분석하여 KDI대학원 관련성을 평가해주세요.

${JSON.stringify(newsData, null, 2)}`;
}
```

### 5.3 점수 기반 필터링 (`scorer.ts`)

```typescript
import { CuratedNewsItem, Priority, CurationCriteria } from '../../shared/types';

/** 기본 큐레이션 기준 */
export const DEFAULT_CRITERIA: CurationCriteria = {
  minRelevanceScore: 60,
  maxItemsPerNewsletter: 20,
  mustReadCount: 3,
  recommendedCount: 7,
};

/**
 * 관련성 점수 기준으로 아이템을 필터링한다.
 * @param items 점수가 부여된 뉴스 아이템
 * @param minScore 최소 점수 (기본 60)
 * @returns 통과한 아이템
 */
export function filterByRelevance(
  items: CuratedNewsItem[],
  minScore: number = DEFAULT_CRITERIA.minRelevanceScore
): CuratedNewsItem[];

/**
 * 관련성 점수를 기반으로 우선순위를 부여한다.
 * - 90+: must-read
 * - 70-89: recommended
 * - 60-69: reference
 * 점수 순으로 정렬 후 mustReadCount, recommendedCount에 따라 조정.
 */
export function assignPriority(
  items: CuratedNewsItem[],
  criteria?: CurationCriteria
): CuratedNewsItem[];

/**
 * 뉴스레터에 포함될 최종 아이템 수를 제한한다.
 * must-read → recommended → reference 순서로 우선 포함.
 */
export function limitItems(
  items: CuratedNewsItem[],
  maxItems: number = DEFAULT_CRITERIA.maxItemsPerNewsletter
): CuratedNewsItem[];
```

---

## 6. 배치 처리 전략

비용 효율성을 위해 뉴스 아이템을 배치 단위로 처리한다:

```
수집된 뉴스 40개 → 8개 배치 (5개씩) → 8회 API 호출
```

### 6.1 배치 처리 흐름

```typescript
async curate(items: NewsItem[]): Promise<CuratorResult> {
  const BATCH_SIZE = 5;
  const batches = chunk(items, BATCH_SIZE); // 5개씩 분할
  const allCurated: CuratedNewsItem[] = [];
  const errors: AgentError[] = [];

  for (const batch of batches) {
    try {
      const curated = await this.curateBatch(batch);
      allCurated.push(...curated);
    } catch (error) {
      errors.push({
        agent: 'curator',
        message: `배치 처리 실패: ${(error as Error).message}`,
        timestamp: new Date(),
      });
    }
    // Rate limiting: 배치 간 1초 대기
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 필터링 및 우선순위 부여
  const filtered = filterByRelevance(allCurated);
  const prioritized = assignPriority(filtered);
  const limited = limitItems(prioritized);

  return {
    items: limited,
    totalProcessed: items.length,
    totalPassed: limited.length,
    totalFiltered: items.length - limited.length,
    errors,
  };
}
```

### 6.2 Claude API 호출

```typescript
private async curateBatch(batch: NewsItem[]): Promise<CuratedNewsItem[]> {
  const response = await this.client.messages.create({
    model: this.model,
    max_tokens: 4096,
    temperature: 0.3,
    system: buildSystemPrompt(),
    messages: [
      { role: 'user', content: buildUserPrompt(batch) },
    ],
  });

  const text = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');

  return this.parseResponse(text, batch);
}
```

### 6.3 JSON 파싱 및 검증

```typescript
private parseResponse(response: string, originalItems: NewsItem[]): CuratedNewsItem[] {
  // JSON 블록 추출 (```json ... ``` 또는 순수 JSON)
  const jsonMatch = response.match(/```json\s*([\s\S]*?)```/) || response.match(/(\[[\s\S]*\])/);
  if (!jsonMatch) throw new Error('JSON 응답을 파싱할 수 없습니다');

  const parsed = JSON.parse(jsonMatch[1]);
  if (!Array.isArray(parsed)) throw new Error('응답이 배열이 아닙니다');

  // 원본 NewsItem과 매칭하여 CuratedNewsItem 생성
  return parsed.map(item => {
    const original = originalItems.find(o => o.id === item.id);
    if (!original) return null;

    return {
      ...original,
      relevanceScore: Math.min(100, Math.max(0, Number(item.relevanceScore))),
      categories: validateCategories(item.categories),
      summaryKo: String(item.summaryKo || ''),
      summaryEn: String(item.summaryEn || ''),
      kdiInsight: String(item.kdiInsight || ''),
      priority: 'reference' as Priority, // scorer에서 재할당
      tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
    };
  }).filter(Boolean) as CuratedNewsItem[];
}
```

---

## 7. Error Handling 전략

### 7.1 API 에러 처리

| 에러 유형 | 대응 |
|-----------|------|
| `429 Too Many Requests` | 60초 대기 후 재시도 (최대 3회) |
| `500/503 Server Error` | 5초 대기 후 재시도 (최대 3회) |
| `401 Unauthorized` | 즉시 실패, API 키 확인 필요 에러 반환 |
| JSON 파싱 실패 | 동일 배치 1회 재시도 (프롬프트에 "반드시 JSON" 강조) |
| 응답 누락 (id 불일치) | 해당 아이템 건너뛰기, 에러 로그 기록 |

### 7.2 재시도 로직

```typescript
import { withRetry } from '../../shared/retry';

const curated = await withRetry(
  () => this.curateBatch(batch),
  { maxRetries: 3, baseDelay: 2000, agentName: 'curator', sourceName: 'claude-api' }
);
```

### 7.3 비용 모니터링

- 각 API 호출의 `response.usage`를 로깅한다:
  ```typescript
  console.log(`토큰 사용량: input=${response.usage.input_tokens}, output=${response.usage.output_tokens}`);
  ```
- 월간 비용 상한($25) 초과 시 경고 로그를 남기고 옵션으로 중단할 수 있도록 한다.

---

## 8. Testing 요구사항 (Vitest)

테스트 파일 위치: `tests/unit/curator/`

### 8.1 필수 테스트 목록

```typescript
// tests/unit/curator/index.test.ts
describe('CuratorAgent', () => {
  it('NewsItem[]을 CuratedNewsItem[]으로 변환한다');
  it('배치 단위(5개씩)로 API를 호출한다');
  it('API 에러 시 재시도한다');
  it('빈 입력에 빈 CuratorResult를 반환한다');
  it('CuratorResult에 올바른 통계를 포함한다');
});

// tests/unit/curator/prompts.test.ts
describe('Prompts', () => {
  it('buildSystemPrompt이 6개 카테고리를 포함한다');
  it('buildUserPrompt이 뉴스 아이템 정보를 JSON으로 포함한다');
  it('buildUserPrompt이 content를 500자로 제한한다');
});

// tests/unit/curator/scorer.test.ts
describe('Scorer', () => {
  it('60점 미만 아이템을 필터링한다');
  it('90+ 점수에 must-read를 부여한다');
  it('70-89 점수에 recommended를 부여한다');
  it('60-69 점수에 reference를 부여한다');
  it('최대 아이템 수를 제한한다');
  it('must-read가 mustReadCount를 초과하지 않는다');
});
```

### 8.2 테스트 전략

- **Claude API Mock**: `@anthropic-ai/sdk`를 mock하여 테스트. 실제 API 호출 없이 고정 JSON 응답을 반환하도록 설정.
- **Fixture 데이터**: 다양한 관련성 수준의 `NewsItem[]` 샘플 데이터를 `tests/fixtures/curator/` 에 저장.
- **JSON 파싱 테스트**: 올바른 JSON, 깨진 JSON, 빈 응답 등 다양한 케이스 테스트.
- **점수 분포 테스트**: must-read/recommended/reference 비율이 기대에 맞는지 검증.

---

## 9. Example Usage

```typescript
import { CuratorAgent } from './agents/curator';
import { NewsItem } from './shared/types';

const curator = new CuratorAgent();

// Collector에서 받은 뉴스 아이템
const rawItems: NewsItem[] = [/* ... */];

const result = await curator.curate(rawItems);

console.log(`처리: ${result.totalProcessed}건`);
console.log(`통과: ${result.totalPassed}건`);
console.log(`필터링: ${result.totalFiltered}건`);

// 우선순위별 분류
const mustRead = result.items.filter(i => i.priority === 'must-read');
const recommended = result.items.filter(i => i.priority === 'recommended');
const reference = result.items.filter(i => i.priority === 'reference');

console.log(`필독: ${mustRead.length}건, 추천: ${recommended.length}건, 참고: ${reference.length}건`);

// 개별 아이템 확인
for (const item of result.items) {
  console.log(`[${item.priority}] ${item.title}`);
  console.log(`  점수: ${item.relevanceScore}, 카테고리: ${item.categories.join(', ')}`);
  console.log(`  요약(KO): ${item.summaryKo}`);
  console.log(`  시사점: ${item.kdiInsight}`);
}
```

---

## 10. 구현 시 주의사항

1. **프롬프트 품질**: System prompt는 `prompts.ts`에서 관리하며, 큐레이션 결과의 일관성을 위해 temperature를 0.3으로 낮게 설정한다.

2. **JSON 응답 안정성**: Claude가 간혹 JSON 외 텍스트를 포함할 수 있으므로, 정규식으로 JSON 블록을 추출하는 로직이 필수이다.

3. **카테고리 검증**: Claude 응답의 카테고리가 6개 정의된 `NewsCategory` 타입에 정확히 매칭되는지 검증한다. 오타나 변형은 가장 유사한 카테고리로 매핑한다.

4. **비용 관리**: 주 1회 실행 기준 약 40-60개 뉴스를 처리하며, 예상 비용은 $1-3/회이다. `response.usage`를 로깅하여 모니터링한다.

5. **한국어/영어 혼합 처리**: 한국어 뉴스는 한국어 요약이 자연스럽고, 영어 뉴스는 영어 요약이 자연스럽도록 프롬프트에 명시한다. kdiInsight는 항상 한국어로 생성한다.

6. **배치 사이즈 조절**: 뉴스 content가 길면 토큰 초과가 발생할 수 있다. content를 500자로 제한하고, 필요 시 배치 사이즈를 3개로 줄인다.

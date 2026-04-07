// ============================================================
// Orchestrator Agent - 전체 파이프라인 조율
// Collector → Dedup → Curator → Notion → Mailer → Log
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger.js';
import { withRetry } from '../../shared/retry.js';
import { deduplicate } from '../../shared/deduplicator.js';
import { CollectorAgent } from '../collector/index.js';
import { CuratorAgent } from '../curator/index.js';
import { NotionAgent } from '../notion/index.js';
import { MailerAgent } from '../mailer/index.js';
import { newsSources } from '../collector/sources.config.js';
import type {
  PipelineResult,
  PipelineConfig,
  CollectorResult,
  CuratorResult,
  NotionResult,
  MailerResult,
  AgentError,
  Recipient,
} from '../../shared/types.js';

const logger = new Logger('orchestrator');

/** 기본 파이프라인 설정 */
const DEFAULT_CONFIG: PipelineConfig = {
  sources: newsSources,
  recipients: [],
  curationCriteria: {
    minRelevanceScore: 60,
    maxItemsPerNewsletter: 20,
    mustReadCount: 3,
    recommendedCount: 7,
  },
  notionDbId: process.env.NOTION_DB_ID ?? '',
  notionLogDbId: process.env.NOTION_LOG_DB_ID ?? '',
};

/** 빈 결과 생성 헬퍼 */
function emptyCollectorResult(): CollectorResult {
  return { items: [], sourceResults: [], totalCollected: 0, errors: [] };
}

function emptyCuratorResult(): CuratorResult {
  return { items: [], totalProcessed: 0, totalPassed: 0, totalFiltered: 0, errors: [] };
}

function emptyNotionResult(): NotionResult {
  return { createdPages: [], totalStored: 0, errors: [] };
}

function emptyMailerResult(): MailerResult {
  return { sent: false, recipientCount: 0, issueNumber: 0, subject: '', errors: [] };
}

export class OrchestratorAgent {
  private config: PipelineConfig;

  constructor(config?: Partial<PipelineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 전체 파이프라인을 실행한다.
   * Collector → Dedup → Curator → Notion → Mailer → Log
   */
  async run(): Promise<PipelineResult> {
    const runId = uuidv4();
    const startedAt = new Date();
    const allErrors: AgentError[] = [];

    let collectorResult = emptyCollectorResult();
    let curatorResult = emptyCuratorResult();
    let notionResult = emptyNotionResult();
    let mailerResult = emptyMailerResult();
    let status: 'success' | 'partial' | 'failed' = 'success';

    logger.info(`Pipeline started: ${runId}`);

    // ── Step 1: Collect ──
    try {
      logger.info('Step 1: Collecting news...');
      const collector = new CollectorAgent();
      collectorResult = await withRetry(
        () => collector.collect(this.config.sources),
        { maxRetries: 2, baseDelay: 5000, agentName: 'orchestrator', sourceName: 'collector' },
      );
      allErrors.push(...collectorResult.errors);
      logger.info(`Collected ${collectorResult.totalCollected} items from ${collectorResult.sourceResults.length} sources`);

      if (collectorResult.totalCollected === 0) {
        logger.warn('No items collected, pipeline ending early');
        status = 'partial';
        return buildResult(runId, startedAt, status, collectorResult, curatorResult, notionResult, mailerResult, allErrors);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Collector failed: ${msg}`);
      allErrors.push({ agent: 'collector', message: msg, timestamp: new Date() });
      status = 'failed';
      return buildResult(runId, startedAt, status, collectorResult, curatorResult, notionResult, mailerResult, allErrors);
    }

    // ── Step 2: Deduplicate ──
    logger.info('Step 2: Deduplicating...');
    const { items: dedupedItems, duplicatesRemoved } = deduplicate(collectorResult.items);
    logger.info(`Deduplication: ${collectorResult.items.length} → ${dedupedItems.length} (${duplicatesRemoved} removed)`);

    // ── Step 3: Curate ──
    try {
      logger.info('Step 3: Curating news...');
      const curator = new CuratorAgent();
      curatorResult = await withRetry(
        () => curator.curate(dedupedItems),
        { maxRetries: 2, baseDelay: 5000, agentName: 'orchestrator', sourceName: 'curator' },
      );
      allErrors.push(...curatorResult.errors);
      logger.info(`Curated: ${curatorResult.totalProcessed} processed, ${curatorResult.totalPassed} passed`);

      if (curatorResult.totalPassed === 0) {
        logger.warn('No items passed curation, skipping Notion and Mailer');
        status = 'partial';
        return buildResult(runId, startedAt, status, collectorResult, curatorResult, notionResult, mailerResult, allErrors);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Curator failed: ${msg}`);
      allErrors.push({ agent: 'curator', message: msg, timestamp: new Date() });
      status = 'failed';
      return buildResult(runId, startedAt, status, collectorResult, curatorResult, notionResult, mailerResult, allErrors);
    }

    // ── Step 4: Store to Notion ──
    try {
      logger.info('Step 4: Storing to Notion...');
      const notion = new NotionAgent();
      notionResult = await withRetry(
        () => notion.store(curatorResult.items),
        { maxRetries: 2, baseDelay: 3000, agentName: 'orchestrator', sourceName: 'notion' },
      );
      allErrors.push(...notionResult.errors);
      logger.info(`Stored ${notionResult.totalStored} items to Notion`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Notion storage failed: ${msg}`);
      allErrors.push({ agent: 'notion', message: msg, timestamp: new Date() });
      status = 'partial'; // Notion 실패해도 Mailer는 계속
    }

    // ── Step 5: Send Newsletter ──
    if (this.config.recipients.length > 0) {
      try {
        logger.info('Step 5: Sending newsletter...');
        const mailer = new MailerAgent();
        let issueNumber = 1;
        try {
          const notion = new NotionAgent();
          issueNumber = await notion.getNextIssueNumber();
        } catch {
          logger.warn('Failed to get issue number, using 1');
        }

        mailerResult = await withRetry(
          () => mailer.send(curatorResult.items, this.config.recipients, issueNumber),
          { maxRetries: 2, baseDelay: 5000, agentName: 'orchestrator', sourceName: 'mailer' },
        );
        allErrors.push(...mailerResult.errors);
        logger.info(`Newsletter ${mailerResult.sent ? 'sent' : 'failed'}: ${mailerResult.subject}`);

        if (!mailerResult.sent) {
          status = 'partial';
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`Mailer failed: ${msg}`);
        allErrors.push({ agent: 'mailer', message: msg, timestamp: new Date() });
        status = 'partial';
      }
    } else {
      logger.info('Step 5: No recipients configured, skipping email');
    }

    // ── Step 6: Log to Notion ──
    const result = buildResult(runId, startedAt, status, collectorResult, curatorResult, notionResult, mailerResult, allErrors);

    try {
      logger.info('Step 6: Logging pipeline run...');
      const notion = new NotionAgent();
      await notion.logPipelineRun(result);
    } catch (error) {
      logger.error(`Failed to log pipeline run: ${error instanceof Error ? error.message : String(error)}`);
    }

    logger.info(`Pipeline completed: ${runId} (${status})`);
    return result;
  }
}

function buildResult(
  runId: string,
  startedAt: Date,
  status: 'success' | 'partial' | 'failed',
  collector: CollectorResult,
  curator: CuratorResult,
  notion: NotionResult,
  mailer: MailerResult,
  errors: AgentError[],
): PipelineResult {
  return {
    runId,
    startedAt,
    completedAt: new Date(),
    status,
    collector,
    curator,
    notion,
    mailer,
    errors,
  };
}

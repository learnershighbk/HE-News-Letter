// ============================================================
// KDIS News Curator - Pipeline Entry Point
// 수동 실행: npx tsx src/pipeline.ts
// ============================================================

import 'dotenv/config';
import { OrchestratorAgent } from './agents/orchestrator/index.js';
import { Logger } from './shared/logger.js';
import type { Recipient } from './shared/types.js';

const logger = new Logger('pipeline');

async function main() {
  logger.info('Starting KDIS News Curator Pipeline...');

  // 환경변수에서 수신자 목록 로드
  const recipientsEnv = process.env.NEWSLETTER_RECIPIENTS ?? '';
  const recipients: Recipient[] = recipientsEnv
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0)
    .map(entry => {
      const [email, name] = entry.split(':');
      return { email: email.trim(), name: name?.trim() ?? email.trim() };
    });

  if (recipients.length > 0) {
    logger.info(`Recipients: ${recipients.length} configured`);
  } else {
    logger.warn('No recipients configured (set NEWSLETTER_RECIPIENTS env var)');
  }

  const orchestrator = new OrchestratorAgent({ recipients });

  try {
    const result = await orchestrator.run();

    logger.info('=== Pipeline Result ===');
    logger.info(`Run ID: ${result.runId}`);
    logger.info(`Status: ${result.status}`);
    logger.info(`Collected: ${result.collector.totalCollected}`);
    logger.info(`Curated: ${result.curator.totalPassed}`);
    logger.info(`Stored: ${result.notion.totalStored}`);
    logger.info(`Email sent: ${result.mailer.sent}`);
    logger.info(`Errors: ${result.errors.length}`);

    if (result.errors.length > 0) {
      logger.warn('Errors encountered:');
      result.errors.forEach(e => logger.warn(`  [${e.agent}] ${e.message}`));
    }

    const duration = (result.completedAt.getTime() - result.startedAt.getTime()) / 1000;
    logger.info(`Duration: ${duration.toFixed(1)}s`);

    process.exit(result.status === 'failed' ? 1 : 0);
  } catch (error) {
    logger.error(`Pipeline crashed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();

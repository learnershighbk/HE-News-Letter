// ============================================================
// KDIS News Curator - Retry Utility with Exponential Backoff
// ============================================================

import { Logger } from './logger.js';

export interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  agentName: string;
  sourceName: string;
}

const DEFAULT_OPTIONS: Partial<RetryOptions> = {
  maxRetries: 3,
  baseDelay: 1000,
};

/**
 * 재시도 로직을 적용하여 비동기 함수를 실행한다.
 * exponential backoff: delay = baseDelay * 2^attempt
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxRetries, baseDelay, agentName, sourceName } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };
  const logger = new Logger(`retry:${agentName}`);
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        logger.warn(
          `Attempt ${attempt + 1}/${maxRetries + 1} failed for "${sourceName}", retrying in ${delay}ms`,
          { error: lastError.message }
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        logger.error(
          `All ${maxRetries + 1} attempts failed for "${sourceName}"`,
          { error: lastError.message }
        );
      }
    }
  }

  throw lastError!;
}

import { withRetry } from '@/utils/common/retryStrategy';
import { Logger } from '@shared/utils/logger';

const logger = new Logger('TestError', true);

async function testRetry() {
  logger.info('--- Starting Retry Test ---');
  let attempts = 0;

  try {
    await withRetry(async () => {
      attempts++;
      logger.debug(`Attempt ${attempts}...`);
      if (attempts < 3) {
        throw new Error('503 Service Overloaded');
      }
      return 'Success after retries!';
    }, {
      initialDelayMs: 100,
      onRetry: (err, attempt, delay) => {
        logger.warn(`  Callback: Retrying after error: ${err.code} (Delay: ${delay}ms)`);
      }
    });
    logger.info('Test 1 Passed: Retry recovered successfully.');
  } catch (e) {
    logger.error('Test 1 Failed:', e);
  }

  logger.info('\n--- Starting Fatal Error Test ---');
  try {
    await withRetry(async () => {
      throw new Error('403 Invalid API Key');
    }, { initialDelayMs: 100 });
    logger.error('Test 2 Failed: Should have thrown a fatal error.');
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    const code = typeof e === 'object' && e !== null && 'code' in e && typeof e.code === 'string' ? e.code : 'UNKNOWN';
    logger.info(`Test 2 Passed: Caught fatal error correctly: ${code} (${error.message})`);
  }

  logger.info('\n--- Starting Max Retries Exceeded Test ---');
  attempts = 0;
  try {
    await withRetry(async () => {
      attempts++;
      throw new Error('429 Rate Limit');
    }, { initialDelayMs: 50, maxRetries: 2 });
    logger.error('Test 3 Failed: Should have exceeded max retries.');
  } catch (e: unknown) {
    const code = typeof e === 'object' && e !== null && 'code' in e && typeof e.code === 'string' ? e.code : 'UNKNOWN';
    logger.info(`Test 3 Passed: Exceeded max retries as expected: ${code}. Total attempts: ${attempts}`);
  }
}

testRetry();

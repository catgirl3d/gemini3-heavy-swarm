/**
 * Sanitizes Gemini API error responses for client-side consumption
 * Prevents internal technical details from leaking while maintaining
 * helpful error categories.
 */
import { Logger } from '../utils/logger';

const logger = new Logger('GeminiError');

export interface SafeErrorResponse {
  error: string;
  statusCode: number;
}

/**
 * Maps raw Gemini status codes and messages to safe, human-readable errors
 */
export function getSafeGeminiError(statusCode: number, rawError: string): SafeErrorResponse {
  // Always log the full technical error on the server side
  logger.error(`Technical Logs - Status: ${statusCode}, Details: ${rawError}`);

  // Map HTTP status codes to generic but descriptive messages
  const errorMap: Record<number, string> = {
    400: 'Invalid request parameters or format',
    401: 'Authentication failed: check API key configuration',
    403: 'Access denied: permission error or blocked region',
    404: 'The requested resource or model was not found',
    413: 'Request content exceeds allowed size limits',
    429: 'Rate limit exceeded: too many requests in a short period',
    500: 'Internal Gemini API error: please try again later',
    503: 'Gemini service is temporarily overloaded or unavailable',
    504: 'Gateway timeout: the request took too long to complete',
  };

  const safeMessage = errorMap[statusCode] || `Gemini API error occurred (Status ${statusCode})`;

  return {
    error: safeMessage,
    statusCode: statusCode
  };
}

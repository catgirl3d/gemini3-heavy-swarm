import { AppError, ErrorCode } from '@/utils/errors/AppError';

/**
 * Unit tests for AppError classification logic.
 * These examples correspond to real-world errors from Google Gemini API and SDK.
 */
function runTests() {
  console.log('--- Running AppError Classification Tests ---');

  const testCases = [
    {
      name: '429 via HTTP status',
      input: { err: 'error message', status: 429 },
      expected: ErrorCode.RATE_LIMIT
    },
    {
      name: '503 via HTTP status',
      input: { err: 'error message', status: 503 },
      expected: ErrorCode.SERVICE_OVERLOADED
    },
    {
      name: 'Gemini SDK 429 message',
      input: { err: '[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/...: [429 Too Many Requests] Resource has been exhausted (e.g. check quota).' },
      expected: ErrorCode.RATE_LIMIT
    },
    {
      name: 'Gemini SDK 503 message',
      input: { err: '[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/...: [503 Service Unavailable] The service is currently overloaded. Please try again later.' },
      expected: ErrorCode.SERVICE_OVERLOADED
    },
    {
      name: 'Gemini API status string: RESOURCE_EXHAUSTED',
      input: { err: '{"error": {"code": 429, "message": "...", "status": "RESOURCE_EXHAUSTED"}}' },
      expected: ErrorCode.RATE_LIMIT
    },
    {
      name: 'Gemini API status string: UNAVAILABLE',
      input: { err: '{"error": {"code": 503, "message": "...", "status": "UNAVAILABLE"}}' },
      expected: ErrorCode.SERVICE_OVERLOADED
    },
    {
      name: 'Safety block message',
      input: { err: 'Response blocked due to safety settings: FINISH_REASON_SAFETY' },
      expected: ErrorCode.SAFETY_BLOCK
    },
    {
      name: 'Network error: Failed to fetch',
      input: { err: 'TypeError: Failed to fetch' },
      expected: ErrorCode.NETWORK_ERROR
    },
    {
      name: 'AbortError',
      input: { err: new DOMException('The user aborted a request.', 'AbortError') },
      expected: ErrorCode.ABORTED
    },
    {
      name: '500 Internal Error as Proxy Error',
      input: { err: '500 Internal Server Error', status: 500 },
      expected: ErrorCode.PROXY_ERROR
    },
    {
      name: 'Edge case: Mixed case ResourceExhausted',
      input: { err: 'Error: ResourceExhausted' },
      expected: ErrorCode.RATE_LIMIT
    }
  ];

  let passed = 0;
  testCases.forEach(tc => {
    const appErr = AppError.from(tc.input.err, tc.input.status);
    if (appErr.code === tc.expected) {
      console.log(`✅ [PASS] ${tc.name}`);
      passed++;
    } else {
      console.log(`❌ [FAIL] ${tc.name}`);
      console.log(`   Expected: ${tc.expected}`);
      console.log(`   Received: ${appErr.code}`);
      console.log(`   Message : ${appErr.message}`);
    }
  });

  console.log(`\nResults: ${passed}/${testCases.length} tests passed.`);
  
  if (passed === testCases.length) {
    console.log('Overall: SUCCESS');
  } else {
    console.log('Overall: FAILURE');
    process.exit(1);
  }
}

// Check if running in Node environment
if (typeof process !== 'undefined') {
  runTests();
}

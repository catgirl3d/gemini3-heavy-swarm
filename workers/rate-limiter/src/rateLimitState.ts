export interface StoredRateLimitState {
  windowIndex: number;
  count: number;
}

export interface RateLimitComputationInput {
  storedState: StoredRateLimitState | null;
  currentTimestampMs: number;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitComputationResult {
  nextState: StoredRateLimitState;
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export const getWindowIndex = (timestampMs: number, windowSeconds: number): number => {
  return Math.floor(timestampMs / (windowSeconds * 1000));
};

export const computeRateLimitState = ({
  storedState,
  currentTimestampMs,
  limit,
  windowSeconds,
}: RateLimitComputationInput): RateLimitComputationResult => {
  const windowIndex = getWindowIndex(currentTimestampMs, windowSeconds);
  const windowEndTimestampMs = (windowIndex + 1) * windowSeconds * 1000;
  const retryAfterSeconds = Math.max(1, Math.ceil((windowEndTimestampMs - currentTimestampMs) / 1000));

  const currentState = storedState?.windowIndex === windowIndex
    ? storedState
    : { windowIndex, count: 0 };

  if (currentState.count >= limit) {
    return {
      nextState: currentState,
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  const nextState: StoredRateLimitState = {
    windowIndex,
    count: currentState.count + 1,
  };

  return {
    nextState,
    allowed: true,
    remaining: limit - nextState.count,
    retryAfterSeconds,
  };
};

/**
 * MCP reverse request (Server → Client) timeout configuration
 *
 * These configurations define timeout durations for different types of reverse requests to prevent long blocking
 */

import { createLogger } from '../logger/index.js';

// Logger for reverseRequestConfig
const logger = createLogger('reverseRequestConfig');

/**
 * Reverse request timeout configuration (unit: milliseconds)
 */
export const REVERSE_REQUEST_TIMEOUTS = {
  /**
   * Sampling request timeout (LLM call)
   * Default 60 seconds - considering LLM API may need longer time to generate response
   */
  sampling: 60000,

  /**
   * Elicitation request timeout (user input collection)
   * Default 5 minutes - users may need time to fill forms
   */
  elicitation: 300000,

  /**
   * Roots request timeout (filesystem query)
   * Default 10 seconds - filesystem queries are usually fast
   */
  roots: 10000,
} as const;

/**
 * Read timeout configuration from environment variables (optional)
 * Allows dynamic adjustment of timeout during deployment
 */
export function getReverseRequestTimeout(type: keyof typeof REVERSE_REQUEST_TIMEOUTS): number {
  const envKey = `REVERSE_REQUEST_TIMEOUT_${type.toUpperCase()}`;
  const envValue = process.env[envKey];

  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
    logger.warn({
      envKey,
      envValue,
      defaultValue: REVERSE_REQUEST_TIMEOUTS[type]
    }, 'Invalid timeout value, using default');
  }

  return REVERSE_REQUEST_TIMEOUTS[type];
}

/**
 * Reverse request error type
 */
export class ReverseRequestTimeoutError extends Error {
  constructor(
    public requestType: string,
    public timeoutMs: number,
    public serverId?: string
  ) {
    super(`Reverse request timeout: ${requestType} exceeded ${timeoutMs}ms${serverId ? ` (server: ${serverId})` : ''}`);
    this.name = 'ReverseRequestTimeoutError';
  }
}

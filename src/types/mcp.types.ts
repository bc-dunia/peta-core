/**
 * Proxy context passed in _meta for reverse request routing
 */
export interface ProxyContext {
  /**
   * Unique proxy request ID
   * Format: sessionId:originalRequestId:timestamp
   */
  proxyRequestId: string;

  /**
   * Uniform request ID for log correlation
   * Format: sessionId_timestamp_random4
   */
  uniformRequestId: string;
}

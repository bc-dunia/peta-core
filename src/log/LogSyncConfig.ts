/**
 * Log Sync Configuration
 * Log sync service configuration constants
 */

export class LogSyncConfig {
  /**
   * Batch sync log count threshold
   * Triggers sync when the number of logs in queue reaches this value
   */
  static readonly SYNC_BATCH_SIZE = 1000;

  /**
   * Sync interval (milliseconds)
   * Triggers sync every 5 minutes, regardless of how many logs are in queue
   */
  static readonly SYNC_INTERVAL = 300000; // 5 minutes

  /**
   * Timeout for flushing logs on shutdown (milliseconds)
   * Prevents waiting too long during shutdown
   */
  static readonly SHUTDOWN_TIMEOUT = 10000; // 10 seconds

  /**
   * HTTP request timeout (milliseconds)
   * Timeout for sending logs to webhook URL
   */
  static readonly HTTP_TIMEOUT = 30000; // 30 seconds

  /**
   * Retry count
   * Number of retries when sync fails
   */
  static readonly RETRY_COUNT = 1;
}

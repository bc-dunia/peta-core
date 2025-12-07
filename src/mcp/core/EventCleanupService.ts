import { EventRepository } from '../../repositories/EventRepository.js';
import { LogService } from '../../log/LogService.js';
import { MCPEventLogType } from '../../types/enums.js';
import { createLogger } from '../../logger/index.js';

/**
 * Event cleanup service
 * Responsible for periodically cleaning up expired event data to maintain system performance
 */
export class EventCleanupService {
  // Logger for EventCleanupService
  private logger = createLogger('EventCleanupService');
  
  private cleanupInterval!: NodeJS.Timeout;
  private cleanupIntervalMs: number = 24 * 60 * 60 * 1000; // 24 hours
  private isRunning: boolean = false;
  private lastCleanupTime: Date | null = null;
  private totalCleanedEvents: number = 0;

  constructor() {
    this.startCleanupTimer();
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.isRunning) {
      this.logger.debug('EventCleanupService is already running');
      return;
    }

    this.isRunning = true;
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupExpiredEvents();
      } catch (error) {
        this.logger.error({ error }, 'Event cleanup failed');
        await LogService.getInstance().enqueueLog({action: MCPEventLogType.ErrorInternal, error: `Event cleanup failed: ${ String(error)}`});
      }
    }, this.cleanupIntervalMs);

    this.logger.info({ intervalMs: this.cleanupIntervalMs }, 'EventCleanupService started');
  }

  /**
   * Clean up expired events
   */
  async cleanupExpiredEvents(): Promise<void> {
    try {
      const startTime = Date.now();
      this.logger.info('Starting expired events cleanup...');

      // Clean up expired events
      const deletedCount = await EventRepository.deleteExpired();
      
      if (deletedCount > 0) {
        this.totalCleanedEvents += deletedCount;
        this.logger.info({ deletedCount }, 'Cleaned up expired events');
      } else {
        this.logger.debug('No expired events found during cleanup');
      }

      this.lastCleanupTime = new Date();
      const duration = Date.now() - startTime;
      this.logger.info({ duration }, 'Event cleanup completed');
    } catch (error) {
      this.logger.error({ error }, 'Failed to cleanup expired events');
      throw error;
    }
  }

  /**
   * Clean up events before specified date
   * @param date Cutoff date
   */
  async cleanupEventsBefore(date: Date): Promise<number> {
    try {
      this.logger.info({ date: date.toISOString() }, 'Cleaning up events before date');
      
      const deletedCount = await EventRepository.deleteBefore(date);
      
      if (deletedCount > 0) {
        this.totalCleanedEvents += deletedCount;
        this.logger.info({ deletedCount, date: date.toISOString() }, 'Cleaned up events before date');
      }
      
      return deletedCount;
    } catch (error) {
      this.logger.error({ error }, 'Failed to cleanup events before date');
      throw error;
    }
  }

  /**
   * Clean up all events for specified stream
   * @param streamId Stream ID
   */
  async cleanupStreamEvents(streamId: string): Promise<number> {
    try {
      this.logger.info({ streamId }, 'Cleaning up all events for stream');
      
      const deletedCount = await EventRepository.deleteByStreamId(streamId);
      
      if (deletedCount > 0) {
        this.totalCleanedEvents += deletedCount;
        this.logger.info({ deletedCount, streamId }, 'Cleaned up events for stream');
      }
      
      return deletedCount;
    } catch (error) {
      this.logger.error({ error, streamId }, 'Failed to cleanup stream events');
      throw error;
    }
  }

  /**
   * Manually trigger cleanup (for testing or emergency cleanup)
   */
  async manualCleanup(): Promise<void> {
    try {
      this.logger.info('Manual cleanup triggered');
      await this.cleanupExpiredEvents();
      this.logger.info('Manual cleanup completed');
    } catch (error) {
      this.logger.error({ error }, 'Manual cleanup failed');
      throw error;
    }
  }

  /**
   * Get cleanup service status
   */
  getStatus(): {
    isRunning: boolean;
    lastCleanupTime: Date | null;
    totalCleanedEvents: number;
    nextCleanupTime: Date | null;
  } {
    const nextCleanupTime = this.lastCleanupTime 
      ? new Date(this.lastCleanupTime.getTime() + this.cleanupIntervalMs)
      : null;

    return {
      isRunning: this.isRunning,
      lastCleanupTime: this.lastCleanupTime,
      totalCleanedEvents: this.totalCleanedEvents,
      nextCleanupTime
    };
  }

  /**
   * Stop cleanup service
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.isRunning = false;
      this.logger.info('EventCleanupService stopped');
    }
  }

  /**
   * Restart cleanup service
   */
  restart(): void {
    this.stop();
    this.startCleanupTimer();
  }

  /**
   * Set cleanup interval
   * @param intervalMs Interval time (milliseconds)
   */
  setCleanupInterval(intervalMs: number): void {
    if (intervalMs < 60000) { // Minimum 1 minute
      throw new Error('Cleanup interval must be at least 1 minute');
    }

    this.cleanupIntervalMs = intervalMs;
    this.restart();
    this.logger.info({ intervalMs }, 'Cleanup interval updated');
  }
}

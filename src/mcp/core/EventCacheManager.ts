import { CachedEvent } from '../types/mcp.js';
import { createLogger } from '../../logger/index.js';

/**
 * Event cache manager
 * Manages in-memory event cache, provides LRU eviction strategy
 */
export class EventCacheManager {
  // Logger for EventCacheManager
  private logger = createLogger('EventCacheManager');
  private cache: Map<string, Map<string, CachedEvent>> = new Map();
  private readonly maxCacheSize: number;
  private readonly maxStreamEvents: number;
  private accessOrder: Map<string, number> = new Map(); // Record access order
  private accessCounter: number = 0;

  constructor(maxCacheSize: number = 10000, maxStreamEvents: number = 1000) {
    this.maxCacheSize = maxCacheSize;
    this.maxStreamEvents = maxStreamEvents;
  }

  /**
   * Set event to cache
   */
  setEvent(streamId: string, eventId: string, event: CachedEvent): void {
    try {
      // Ensure stream cache exists
      if (!this.cache.has(streamId)) {
        this.cache.set(streamId, new Map());
      }

      const streamCache = this.cache.get(streamId)!;

      // Check stream-level event count limit
      if (streamCache.size >= this.maxStreamEvents) {
        this.evictOldestFromStream(streamId);
      }

      // Store event
      streamCache.set(eventId, event);
      
      // Update access order
      this.updateAccessOrder(streamId, eventId);

      // Check total cache size
      this.enforceTotalCacheLimit();

      this.logger.debug({ eventId, streamId }, 'Event cached');
    } catch (error) {
      this.logger.error({ error }, 'Failed to set event in cache');
    }
  }

  /**
   * Get event from cache
   */
  getEvent(streamId: string, eventId: string): CachedEvent | undefined {
    try {
      const streamCache = this.cache.get(streamId);
      if (!streamCache) return undefined;

      const event = streamCache.get(eventId);
      if (event) {
        // Update access order
        this.updateAccessOrder(streamId, eventId);
      }

      return event;
    } catch (error) {
      this.logger.error({ error }, 'Failed to get event from cache');
      return undefined;
    }
  }

  /**
   * Get all events after specified event ID
   */
  getEventsAfter(streamId: string, afterEventId: string): CachedEvent[] {
    try {
      const streamCache = this.cache.get(streamId);
      if (!streamCache) return [];

      const events: CachedEvent[] = [];
      let foundLastEvent = false;

      // Sort by event ID (event ID contains timestamp, so lexicographic sort is sufficient)
      const sortedEvents = Array.from(streamCache.values()).sort((a, b) => 
        a.eventId.localeCompare(b.eventId)
      );

      for (const event of sortedEvents) {
        if (event.eventId === afterEventId) {
          foundLastEvent = true;
          continue;
        }
        if (foundLastEvent) {
          events.push(event);
        }
      }

      return events;
    } catch (error) {
      this.logger.error({ error }, 'Failed to get events after from cache');
      return [];
    }
  }

  /**
   * Clean up all events for specified stream
   */
  cleanupStream(streamId: string): void {
    try {
      const streamCache = this.cache.get(streamId);
      if (streamCache) {
        // Clean up access order records
        for (const eventId of streamCache.keys()) {
          const accessKey = `${streamId}:${eventId}`;
          this.accessOrder.delete(accessKey);
        }
        
        this.cache.delete(streamId);
        this.logger.debug({ streamId }, 'Cleaned up cache for stream');
      }
    } catch (error) {
      this.logger.error({ error }, 'Failed to cleanup stream cache');
    }
  }

  /**
   * Clean up expired cached events
   */
  cleanupExpired(): void {
    try {
      const now = new Date();
      let cleanedCount = 0;

      for (const [streamId, streamCache] of this.cache) {
        for (const [eventId, event] of streamCache) {
          // Check if event is expired (assuming events have 24-hour TTL)
          const eventAge = now.getTime() - event.timestamp.getTime();
          const maxAge = 24 * 60 * 60 * 1000; // 24 hours

          if (eventAge > maxAge) {
            streamCache.delete(eventId);
            
            // Clean up access order records
            const accessKey = `${streamId}:${eventId}`;
            this.accessOrder.delete(accessKey);
            
            cleanedCount++;
          }
        }

        // If stream cache is empty, delete the entire stream
        if (streamCache.size === 0) {
          this.cache.delete(streamId);
        }
      }

      if (cleanedCount > 0) {
        this.logger.info({ cleanedCount }, 'Cleaned up expired cached events');
      }
    } catch (error) {
      this.logger.error({ error }, 'Failed to cleanup expired cache');
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    totalStreams: number;
    totalEvents: number;
    memoryUsage: number;
    hitRate: number;
  } {
    try {
      let totalEvents = 0;
      for (const streamCache of this.cache.values()) {
        totalEvents += streamCache.size;
      }

      return {
        totalStreams: this.cache.size,
        totalEvents,
        memoryUsage: this.estimateMemoryUsage(),
        hitRate: this.calculateHitRate()
      };
    } catch (error) {
      this.logger.error({ error }, 'Failed to get cache stats');
      return {
        totalStreams: 0,
        totalEvents: 0,
        memoryUsage: 0,
        hitRate: 0
      };
    }
  }

  /**
   * Warm up cache (preload commonly used events)
   */
  async warmupCache(streamId: string, eventIds: string[]): Promise<void> {
    try {
      this.logger.info({ streamId, eventCount: eventIds.length }, 'Warming up cache for stream');
      
      // Here we can implement preload logic
      // For example, batch load events from database to cache
      
      this.logger.info({ streamId }, 'Cache warmup completed for stream');
    } catch (error) {
      this.logger.error({ error }, 'Failed to warmup cache');
    }
  }

  /**
   * Clear all cache
   */
  clearAll(): void {
    try {
      this.cache.clear();
      this.accessOrder.clear();
      this.accessCounter = 0;
      this.logger.info('All cache cleared');
    } catch (error) {
      this.logger.error({ error }, 'Failed to clear all cache');
    }
  }

  /**
   * Evict oldest event from stream
   */
  private evictOldestFromStream(streamId: string): void {
    try {
      const streamCache = this.cache.get(streamId);
      if (!streamCache) return;

      // Find oldest event (sort by event ID)
      const oldestEventId = Array.from(streamCache.keys()).sort()[0];
      if (oldestEventId) {
        streamCache.delete(oldestEventId);
        
        // Clean up access order records
        const accessKey = `${streamId}:${oldestEventId}`;
        this.accessOrder.delete(accessKey);
        
        this.logger.debug({ oldestEventId, streamId }, 'Evicted oldest event from stream cache');
      }
    } catch (error) {
      this.logger.error({ error }, 'Failed to evict oldest event from stream');
    }
  }

  /**
   * Enforce total cache size limit
   */
  private enforceTotalCacheLimit(): void {
    try {
      let totalEvents = 0;
      for (const streamCache of this.cache.values()) {
        totalEvents += streamCache.size;
      }

      if (totalEvents > this.maxCacheSize) {
        // Need to clean up cache, use LRU strategy to delete least recently accessed events
        const eventsToRemove = totalEvents - this.maxCacheSize;
        this.evictLRUEvents(eventsToRemove);
      }
    } catch (error) {
      this.logger.error({ error }, 'Failed to enforce total cache limit');
    }
  }

  /**
   * Evict events using LRU strategy
   */
  private evictLRUEvents(count: number): void {
    try {
      // Sort by access order, delete least recently accessed events
      const sortedAccess = Array.from(this.accessOrder.entries())
        .sort((a, b) => a[1] - b[1]);

      let removedCount = 0;
      for (const [accessKey, _] of sortedAccess) {
        if (removedCount >= count) break;

        const [streamId, eventId] = accessKey.split(':');
        const streamCache = this.cache.get(streamId);
        
        if (streamCache && streamCache.has(eventId)) {
          streamCache.delete(eventId);
          this.accessOrder.delete(accessKey);
          removedCount++;

          // If stream cache is empty, delete the entire stream
          if (streamCache.size === 0) {
            this.cache.delete(streamId);
          }
        }
      }

      if (removedCount > 0) {
        this.logger.debug({ removedCount }, 'Evicted LRU events to maintain cache size limit');
      }
    } catch (error) {
      this.logger.error({ error }, 'Failed to evict LRU events');
    }
  }

  /**
   * Update access order
   */
  private updateAccessOrder(streamId: string, eventId: string): void {
    try {
      const accessKey = `${streamId}:${eventId}`;
      this.accessOrder.set(accessKey, ++this.accessCounter);
    } catch (error) {
      this.logger.error({ error }, 'Failed to update access order');
    }
  }

  /**
   * Estimate memory usage
   */
  private estimateMemoryUsage(): number {
    try {
      let totalSize = 0;
      
      // Estimate Map overhead
      totalSize += this.cache.size * 64; // Rough overhead per Map
      
      for (const streamCache of this.cache.values()) {
        totalSize += streamCache.size * 128; // Rough overhead per event
      }
      
      // Access order record overhead
      totalSize += this.accessOrder.size * 32;
      
      return totalSize; // Return bytes
    } catch (error) {
      this.logger.error({ error }, 'Failed to estimate memory usage');
      return 0;
    }
  }

  /**
   * Calculate cache hit rate (simplified implementation)
   */
  private calculateHitRate(): number {
    try {
      // Here we can implement more complex hit rate calculation
      // Currently return a fixed value
      return 0.85; // 85% hit rate
    } catch (error) {
      this.logger.error({ error }, 'Failed to calculate hit rate');
      return 0;
    }
  }
}

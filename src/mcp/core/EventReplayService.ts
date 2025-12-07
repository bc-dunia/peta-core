import { Response } from 'express';
import { PersistentEventStore } from './PersistentEventStore.js';
import { JSONRPCMessage } from '../types/mcp.js';
import { createLogger } from '../../logger/index.js';

/**
 * Event replay service
 * Handles event replay logic when clients reconnect
 */
export class EventReplayService {
  // Logger for EventReplayService
  private logger = createLogger('EventReplayService');
  
  constructor(private eventStore: PersistentEventStore) {}

  /**
   * Replay events for specified stream
   * @param streamId Stream ID
   * @param lastEventId Last received event ID
   * @param res HTTP response object
   */
  async replayEventsForStream(streamId: string, lastEventId: string, res: Response): Promise<void> {
    try {
      // Set SSE response headers
      const headers: Record<string, string> = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      };

      res.writeHead(200, headers).flushHeaders();

      this.logger.info({ streamId, lastEventId }, 'Starting event replay for stream after event');

      // Use EventStore to replay events
      await this.eventStore.replayEventsAfter(lastEventId, {
        send: async (eventId: string, message: JSONRPCMessage) => {
          try {
            const eventData = this.formatSSEEvent(message, eventId);
            if (!res.write(eventData)) {
              throw new Error('Failed to write SSE event');
            }
            this.logger.debug({ eventId }, 'Replayed event');
          } catch (error) {
            this.logger.error({ error, eventId }, 'Failed to replay event');
            throw error;
          }
        }
      });

      this.logger.info({ streamId }, 'Event replay completed for stream');
    } catch (error) {
      this.logger.error({ error, streamId }, 'Failed to replay events for stream');
      throw error;
    }
  }

  /**
   * Replay all events for specified session
   * @param sessionId Session ID
   * @param res HTTP response object
   */
  async replayAllEventsForSession(sessionId: string, res: Response): Promise<void> {
    try {
      // Set SSE response headers
      const headers: Record<string, string> = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      };

      res.writeHead(200, headers).flushHeaders();

      this.logger.info({ sessionId }, 'Starting full event replay for session');

      // Here we can implement logic to fetch all events from database and replay them
      // Currently using empty implementation
      
      this.logger.info({ sessionId }, 'Full event replay completed for session');
    } catch (error) {
      this.logger.error({ error, sessionId }, 'Failed to replay all events for session');
      throw error;
    }
  }

  /**
   * Format SSE event
   * @param message JSON-RPC message
   * @param eventId Event ID (optional)
   * @returns Formatted SSE event string
   */
  private formatSSEEvent(message: JSONRPCMessage, eventId?: string): string {
    let eventData = `event: message\n`;
    
    if (eventId) {
      eventData += `id: ${eventId}\n`;
    }
    
    eventData += `data: ${JSON.stringify(message)}\n\n`;
    return eventData;
  }

  /**
   * Check if event replay is available
   */
  isReplayAvailable(): boolean {
    return this.eventStore !== undefined;
  }

  /**
   * Get replay statistics
   */
  async getReplayStats(): Promise<{
    totalEvents: number;
    replayedEvents: number;
    failedEvents: number;
    lastReplayTime: Date | null;
  }> {
    try {
      // Here we can implement statistics collection logic
      return {
        totalEvents: 0,
        replayedEvents: 0,
        failedEvents: 0,
        lastReplayTime: null
      };
    } catch (error) {
      this.logger.error({ error }, 'Failed to get replay stats');
      return {
        totalEvents: 0,
        replayedEvents: 0,
        failedEvents: 0,
        lastReplayTime: null
      };
    }
  }
}

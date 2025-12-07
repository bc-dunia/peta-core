import { LogService } from './LogService.js';
import { MCPEventLogType } from '../types/enums.js';

/**
 * ServerLogger - For server lifecycle events (no userId required)
 * Used by ServerManager for server-initiated events
 *
 * Design:
 * - Created per downstream MCP server connection
 * - Does NOT include userId (server events are independent of user sessions)
 * - Logs server lifecycle, status changes, capability updates
 */
export class ServerLogger {
  private serverId: string;

  constructor(serverId: string) {
    this.serverId = serverId;
  }

  /**
   * Log server lifecycle events (1310-1311)
   * For: ServerInit, ServerClose
   */
  logServerLifecycle(data: {
    action: MCPEventLogType.ServerInit | MCPEventLogType.ServerClose;
    error?: string;
  }): Promise<void> {
    return LogService.getInstance().enqueueLog({
      action: data.action,
      serverId: this.serverId,
      error: data.error
    });
  }

  /**
   * Log server status change (1312)
   * For: ServerStatusChange - online/offline/connecting/error
   */
  logServerStatusChange(data: {
    error?: string;
  }): Promise<void> {
    return LogService.getInstance().enqueueLog({
      action: MCPEventLogType.ServerStatusChange,
      serverId: this.serverId,
      error: data.error
    });
  }

  /**
   * Log server capability updates (1313)
   * Triggered by:
   * 1. Server-initiated: listChanged notifications (tools/resources/prompts)
   * 2. Admin-initiated: capabilities config update via ServerHandler
   */
  logServerCapabilityUpdate(data: {
    requestParams?: any;
  }): Promise<void> {
    return LogService.getInstance().enqueueLog({
      action: MCPEventLogType.ServerCapabilityUpdate,
      serverId: this.serverId,
      requestParams: data.requestParams ? JSON.stringify(data.requestParams) : undefined
    });
  }

  /**
   * Log server notification (1314)
   * For: ToolListChanged, ResourceListChanged, PromptListChanged, etc.
   */
  logServerNotification(data: {
    requestParams?: any;
  }): Promise<void> {
    return LogService.getInstance().enqueueLog({
      action: MCPEventLogType.ServerNotification,
      serverId: this.serverId,
      requestParams: data.requestParams ? JSON.stringify(data.requestParams) : undefined
    });
  }

  /**
   * Log server errors (4000-4099)
   * For errors during server connection/operation
   */
  logError(data: {
    action: MCPEventLogType;
    error: string;
  }): Promise<void> {
    return LogService.getInstance().enqueueLog({
      action: data.action,
      serverId: this.serverId,
      error: data.error
    });
  }
}

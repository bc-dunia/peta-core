import { LogService } from './LogService.js';
import { LogRepository } from '../repositories/LogRepository.js';
import { MCPEventLogType } from '../types/enums.js';
import { truncateResponseResult } from '../utils/truncateResponse.js';

// Read response truncation limit from environment (0 = no limit)
const MAX_RESPONSE_LENGTH = parseInt(process.env.LOG_RESPONSE_MAX_LENGTH || '300', 10);

/**
 * SessionLogger - Per-session logger with dynamic context updates
 * Captures HTTP-layer context (ip, userAgent) and session info (userId, sessionId, tokenMask)
 *
 * Design:
 * - Created once per ClientSession with initial HTTP context
 * - Context (ip, userAgent) updated on each HTTP request
 * - Provides convenience methods for different event categories
 * - Automatically includes userId, sessionId, tokenMask, ip, userAgent in all logs
 */
export class SessionLogger {
  private userId: string;
  private sessionId: string;
  private tokenMask: string;
  private ip: string;
  private userAgent: string;

  constructor(data: {
    userId: string;
    sessionId: string;
    tokenMask: string;
    ip: string;
    userAgent: string;
  }) {
    this.userId = data.userId;
    this.sessionId = data.sessionId;
    this.tokenMask = data.tokenMask;
    this.ip = data.ip;
    this.userAgent = data.userAgent;
  }

  /**
   * Update dynamic context (ip, userAgent) on each HTTP request
   * Called when client makes new HTTP request (ip may change due to network switching)
   */
  updateContext(ip: string, userAgent: string): void {
    this.ip = ip;
    this.userAgent = userAgent;
  }

  getIp(): string {
    return this.ip;
  }

  getUserAgent(): string {
    return this.userAgent;
  }

  /**
   * Log client → gateway request (1001-1006)
   * For: RequestTool, RequestResource, RequestPrompt, ResponseTool, ResponseResource, ResponsePrompt
   */
  logClientRequest(data: {
    action: MCPEventLogType;
    upstreamRequestId: string;
    uniformRequestId: string;
    serverId?: string;
    requestParams?: any;
    responseResult?: any;
    error?: string;
    duration?: number;
    statusCode?: number;
  }): Promise<void> {
    // Keep full error responses, truncate successful responses
    const responseResult = data.responseResult
      ? (data.error
          ? JSON.stringify(data.responseResult)
          : truncateResponseResult(data.responseResult, MAX_RESPONSE_LENGTH))
      : undefined;

    return LogService.getInstance().enqueueLog({
      action: data.action,
      userId: this.userId,
      sessionId: this.sessionId,
      serverId: data.serverId,
      upstreamRequestId: data.upstreamRequestId,
      uniformRequestId: data.uniformRequestId,
      ip: this.ip,
      userAgent: this.userAgent,
      tokenMask: this.tokenMask,
      requestParams: data.requestParams ? JSON.stringify(data.requestParams) : undefined,
      responseResult: responseResult,
      error: data.error,
      duration: data.duration,
      statusCode: data.statusCode
    });
  }

  /**
   * Log gateway → server request (1101-1106)
   * For: ServerToolCall, ServerResourceRead, ServerPromptGet, ServerToolResponse, ServerResourceResponse, ServerPromptResponse
   */
  logServerRequest(data: {
    action: MCPEventLogType;
    serverId: string;
    upstreamRequestId: string;
    uniformRequestId: string;
    proxyRequestId: string;
    requestParams?: any;
    responseResult?: any;
    error?: string;
    duration?: number;
    statusCode?: number;
  }): Promise<void> {
    // Keep full error responses, truncate successful responses
    const responseResult = data.responseResult
      ? (data.error
          ? JSON.stringify(data.responseResult)
          : truncateResponseResult(data.responseResult, MAX_RESPONSE_LENGTH))
      : undefined;

    return LogService.getInstance().enqueueLog({
      action: data.action,
      userId: this.userId,
      sessionId: this.sessionId,
      serverId: data.serverId,
      upstreamRequestId: data.upstreamRequestId,
      uniformRequestId: data.uniformRequestId,
      proxyRequestId: data.proxyRequestId,
      ip: this.ip,
      userAgent: this.userAgent,
      tokenMask: this.tokenMask,
      requestParams: data.requestParams ? JSON.stringify(data.requestParams) : undefined,
      responseResult: responseResult,
      error: data.error,
      duration: data.duration,
      statusCode: data.statusCode
    });
  }

  /**
   * Log reverse request (server → client) (1201-1206)
   * For: ReverseSamplingRequest/Response, ReverseRootsListRequest/Response, ReversePromptElicitationRequest/Response
   *
   * Note: parentUniformRequestId links reverse request to original client request
   */
  logReverseRequest(data: {
    action: MCPEventLogType;
    serverId: string;
    upstreamRequestId: string;
    uniformRequestId: string;
    parentUniformRequestId: string;
    proxyRequestId: string;
    requestParams?: any;
    responseResult?: any;
    error?: string;
    duration?: number;
    statusCode?: number;
  }): Promise<void> {
    // Keep full error responses, truncate successful responses
    const responseResult = data.responseResult
      ? (data.error
          ? JSON.stringify(data.responseResult)
          : truncateResponseResult(data.responseResult, MAX_RESPONSE_LENGTH))
      : undefined;

    return LogService.getInstance().enqueueLog({
      action: data.action,
      userId: this.userId,
      sessionId: this.sessionId,
      serverId: data.serverId,
      upstreamRequestId: data.upstreamRequestId,
      uniformRequestId: data.uniformRequestId,
      parentUniformRequestId: data.parentUniformRequestId,
      proxyRequestId: data.proxyRequestId,
      ip: this.ip,
      userAgent: this.userAgent,
      tokenMask: this.tokenMask,
      requestParams: data.requestParams ? JSON.stringify(data.requestParams) : undefined,
      responseResult: responseResult,
      error: data.error,
      duration: data.duration,
      statusCode: data.statusCode
    });
  }

  /**
   * Log session lifecycle events (1301-1302)
   * For: SessionInit, SessionClose
   */
  logSessionLifecycle(data: {
    action: MCPEventLogType.SessionInit | MCPEventLogType.SessionClose;
    error?: string;
  }): Promise<void> {
    return LogService.getInstance().enqueueLog({
      action: data.action,
      userId: this.userId,
      sessionId: this.sessionId,
      ip: this.ip,
      userAgent: this.userAgent,
      tokenMask: this.tokenMask,
      error: data.error
    });
  }

  /**
   * Log authentication events (3001-3010)
   * For: AuthTokenValidation, AuthPermissionCheck, AuthRateLimit, etc.
   *
   * Note: AuthTokenValidation only logged on FIRST validation, AuthPermissionCheck only on failure
   */
  logAuth(data: {
    action: MCPEventLogType;
    error?: string;
    requestParams?: any;
  }): Promise<void> {
    return LogService.getInstance().enqueueLog({
      action: data.action,
      userId: this.userId,
      sessionId: this.sessionId,
      ip: this.ip,
      userAgent: this.userAgent,
      tokenMask: this.tokenMask,
      error: data.error,
      requestParams: data.requestParams ? JSON.stringify(data.requestParams) : undefined
    });
  }

  /**
   * Log errors (4000-4099)
   * For: ErrorInternal, ErrorUpstreamServer, ErrorTimeout, ErrorRateLimit, ErrorValidation, etc.
   */
  logError(data: {
    action: MCPEventLogType;
    error: string;
    serverId?: string;
    upstreamRequestId?: string;
    uniformRequestId?: string;
  }): Promise<void> {
    return LogService.getInstance().enqueueLog({
      action: data.action,
      userId: this.userId,
      sessionId: this.sessionId,
      serverId: data.serverId,
      upstreamRequestId: data.upstreamRequestId,
      uniformRequestId: data.uniformRequestId,
      ip: this.ip,
      userAgent: this.userAgent,
      tokenMask: this.tokenMask,
      error: data.error
    });
  }
}

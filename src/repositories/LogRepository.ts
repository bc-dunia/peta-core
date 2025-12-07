/**
 * Log Repository - Direct database access using Prisma
 */

import { prisma } from '../config/prisma.js';
import { Log } from '@prisma/client';

export interface LogEntry {
  action: number;
  userId?: string;
  serverId?: string;
  sessionId?: string;
  upstreamRequestId?: string;
  uniformRequestId?: string | null;
  parentUniformRequestId?: string;
  proxyRequestId?: string;
  ip?: string;
  userAgent?: string;
  tokenMask?: string;
  requestParams?: string;
  responseResult?: string;
  error?: string;
  duration?: number;
  statusCode?: number;
}

export class LogRepository {
  /**
   * Create log record
   */
  static async save(data: LogEntry): Promise<Log> {
    return await prisma.log.create({
      data: {
        createdAt: Math.floor(Date.now() / 1000),
        userid: data.userId,
        action: data.action,
        serverId: data.serverId,
        sessionId: data.sessionId ?? '',
        upstreamRequestId: data.upstreamRequestId ?? '',
        uniformRequestId: data.uniformRequestId,
        parentUniformRequestId: data.parentUniformRequestId,
        proxyRequestId: data.proxyRequestId,
        ip: data.ip ?? '',
        ua: data.userAgent ?? '',
        tokenMask: data.tokenMask ?? '',
        requestParams: data.requestParams ?? '',
        responseResult: data.responseResult ?? '',
        error: data.error ?? '',
        duration: data.duration,
        statusCode: data.statusCode,
      }
    });
  }

  /**
   * Get log records within specified ID range
   * @param startId Starting ID (inclusive)
   * @param limit Limit on number of records to fetch
   */
  static async findLogsFromId(startId: number, limit: number): Promise<Log[]> {
    return await prisma.log.findMany({
      where: {
        id: {
          gte: startId
        }
      },
      orderBy: {
        id: 'asc'
      },
      take: limit
    });
  }

  /**
   * Get current maximum log ID
   */
  static async getMaxLogId(): Promise<number> {
    const result = await prisma.log.findFirst({
      orderBy: {
        id: 'desc'
      },
      select: {
        id: true
      }
    });
    return result?.id ?? 0;
  }

  /**
   * Clear all log records
   */
  static async deleteAll(): Promise<void> {
    await prisma.log.deleteMany({});
  }
}


// Export singleton (backward compatibility)
export default LogRepository;

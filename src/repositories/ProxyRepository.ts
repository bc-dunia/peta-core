/**
 * Proxy Repository - Direct database access using Prisma
 */

import { prisma } from '../config/prisma.js';
import { Prisma, Proxy } from '@prisma/client';

export class ProxyRepository {
  /**
   * Find first proxy record (system has only one proxy)
   */
  static async findFirst(): Promise<Proxy | null> {
    return await prisma.proxy.findFirst();
  }

  /**
   * Find proxy by ID
   */
  static async findById(id: number): Promise<Proxy | null> {
    return await prisma.proxy.findUnique({
      where: { id }
    });
  }

  /**
   * Find all proxy records
   */
  static async findAll(): Promise<Proxy[]> {
    return await prisma.proxy.findMany();
  }

  /**
   * Create new proxy record
   */
  static async create(data: Prisma.ProxyCreateInput): Promise<Proxy> {
    return await prisma.proxy.create({ data });
  }

  /**
   * Update proxy record
   */
  static async update(id: number, data: Prisma.ProxyUpdateInput): Promise<Proxy> {
    return await prisma.proxy.update({
      where: { id },
      data
    });
  }

  /**
   * Delete proxy record
   */
  static async delete(id: number): Promise<Proxy> {
    return await prisma.proxy.delete({
      where: { id }
    });
  }

  /**
   * Check if proxy exists
   */
  static async exists(id: number): Promise<boolean> {
    const proxy = await prisma.proxy.findUnique({
      where: { id },
      select: { id: true }
    });
    return proxy !== null;
  }

  /**
   * Bulk create proxy records (for restore)
   */
  static async bulkCreate(proxies: Prisma.ProxyCreateManyInput[]): Promise<number> {
    const result = await prisma.proxy.createMany({
      data: proxies,
      skipDuplicates: true
    });
    return result.count;
  }

  /**
   * Find proxy by proxyKey
   */
  static async findByProxyKey(proxyKey: string): Promise<Proxy | null> {
    return await prisma.proxy.findFirst({
      where: { proxyKey }
    });
  }

  /**
   * Update proxy webhook URL
   */
  static async updateWebhookUrl(proxyId: number, url: string | null): Promise<Proxy> {
    return await prisma.proxy.update({
      where: { id: proxyId },
      data: { logWebhookUrl: url }
    });
  }

  /**
   * Update last synced log ID
   */
  static async updateLastSyncedLogId(proxyId: number, logId: number): Promise<Proxy> {
    return await prisma.proxy.update({
      where: { id: proxyId },
      data: { lastSyncedLogId: logId }
    });
  }

  /**
   * Get last synced log ID
   */
  static async getLastSyncedLogId(proxyId: number): Promise<number> {
    const proxy = await prisma.proxy.findUnique({
      where: { id: proxyId },
      select: { lastSyncedLogId: true }
    });
    return proxy?.lastSyncedLogId ?? 0;
  }
}

// Export singleton (backward compatibility)
export default ProxyRepository;

/**
 * User Repository - Directly accesses the database using Prisma
 */

import { prisma } from '../config/prisma.js';
import { Prisma, User } from '@prisma/client';

export class UserRepository {
  /**
   * Find user by user ID
   */
  static async findByUserId(userId: string): Promise<User | null> {
    return await prisma.user.findUnique({
      where: { userId }
    });
  }

  /**
   * Find user by ID (alias method, equivalent to findByUserId)
   */
  static async findById(userId: string): Promise<User | null> {
    return this.findByUserId(userId);
  }

  /**
   * Find all users
   */
  static async findAll(): Promise<User[]> {
    return await prisma.user.findMany();
  }

  /**
   * Create new user
   */
  static async create(data: Prisma.UserCreateInput): Promise<User> {
    return await prisma.user.create({ data });
  }

  /**
   * Update user
   */
  static async update(userId: string, data: Prisma.UserUpdateInput): Promise<User> {
    return await prisma.user.update({
      where: { userId },
      data: { ...data, updatedAt: Math.floor(Date.now() / 1000) }
    });
  }

  /**
   * Create or update user
   */
  static async upsert(
    userId: string, 
    create: Prisma.UserCreateInput,
    update: Prisma.UserUpdateInput
  ): Promise<User> {
    return await prisma.user.upsert({
      where: { userId },
      create,
      update
    });
  }

  /**
   * Delete user
   */
  static async delete(userId: string): Promise<User> {
    return await prisma.user.delete({
      where: { userId }
    });
  }

  /**
   * Find users by status
   */
  static async findByStatus(status: number): Promise<User[]> {
    return await prisma.user.findMany({
      where: { status }
    });
  }

  /**
   * Find users by role
   */
  static async findByRole(role: number): Promise<User[]> {
    return await prisma.user.findMany({
      where: { role }
    });
  }

  /**
   * Check if user exists
   */
  static async exists(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { userId },
      select: { userId: true }
    });
    return user !== null;
  }

  /**
   * Update user permissions
   */
  static async updatePermissions(userId: string, permissions: any): Promise<User> {
    return await prisma.user.update({
      where: { userId },
      data: {
        permissions: JSON.stringify(permissions),
        updatedAt: Math.floor(Date.now() / 1000)
      }
    });
  }

  /**
   * Update user Launch Configs
   */
  static async updateLaunchConfigs(userId: string, launchConfigs: any): Promise<User> {
    return await prisma.user.update({
      where: { userId },
      data: {
        launchConfigs: JSON.stringify(launchConfigs),
        updatedAt: Math.floor(Date.now() / 1000)
      }
    });
  }

  /**
   * Update user User Preferences
   */
  static async updateUserPreferences(userId: string, userPreferences: any): Promise<User> {
    return await prisma.user.update({
      where: { userId },
      data: {
        userPreferences: JSON.stringify(userPreferences),
        updatedAt: Math.floor(Date.now() / 1000)
      }
    });
  }

  /**
   * Remove specified server from all users' configurations
   * Used to clean up user configurations when deleting template server
   */
  static async removeServerFromAllUsers(serverId: string): Promise<void> {
    // Get all users
    const allUsers = await prisma.user.findMany();

    // Update users one by one
    for (const user of allUsers) {
      let needsUpdate = false;

      // Parse and clean launchConfigs
      let launchConfigs: any = {};
      try {
        launchConfigs = JSON.parse(user.launchConfigs || '{}');
        if (launchConfigs[serverId]) {
          delete launchConfigs[serverId];
          needsUpdate = true;
        }
      } catch (error) {
        // On parse failure, use empty object, don't log error (avoid log noise)
        launchConfigs = {};
      }

      // Parse and clean userPreferences
      let userPreferences: any = {};
      try {
        userPreferences = JSON.parse(user.userPreferences || '{}');
        if (userPreferences[serverId]) {
          delete userPreferences[serverId];
          needsUpdate = true;
        }
      } catch (error) {
        // On parse failure, use empty object, don't log error (avoid log noise)
        userPreferences = {};
      }

      // If update needed, save
      if (needsUpdate) {
        await prisma.user.update({
          where: { userId: user.userId },
          data: {
            launchConfigs: JSON.stringify(launchConfigs),
            userPreferences: JSON.stringify(userPreferences),
            updatedAt: Math.floor(Date.now() / 1000)
          }
        });
        // Silent update, no logging needed
      }
    }
  }

  /**
   * Find user list by proxyId
   */
  static async findByProxyId(proxyId: number): Promise<User[]> {
    return await prisma.user.findMany({
      where: { proxyId }
    });
  }

  /**
   * Count non-owner users
   */
  static async countNonOwners(): Promise<number> {
    return await prisma.user.count({
      where: {
        role: { not: 1 } // Exclude owner role (role=1)
      }
    });
  }

  /**
   * Batch delete users by proxyId
   */
  static async deleteByProxyId(proxyId: number): Promise<number> {
    const result = await prisma.user.deleteMany({
      where: { proxyId }
    });
    return result.count;
  }

  /**
   * Bulk create users (for restore)
   */
  static async bulkCreate(users: Prisma.UserCreateManyInput[]): Promise<number> {
    const result = await prisma.user.createMany({
      data: users,
      skipDuplicates: true
    });
    return result.count;
  }

  /**
   * Count users by condition
   */
  static async countByCondition(where: Prisma.UserWhereInput): Promise<number> {
    return await prisma.user.count({ where });
  }
}

// Export singleton (backward compatibility)
export default UserRepository;
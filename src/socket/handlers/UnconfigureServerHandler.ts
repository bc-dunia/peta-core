/**
 * UnconfigureServerHandler - Socket user unconfigure server handler
 *
 * Handles user requests to unconfigure a configured server via Socket.IO
 */

import { UserRepository } from '../../repositories/UserRepository.js';
import { ServerManager } from '../../mcp/core/ServerManager.js';
import { AdminError, AdminErrorCode } from '../../types/admin.types.js';
import { socketNotifier } from '../SocketNotifier.js';
import { SessionStore } from '../../mcp/core/SessionStore.js';
import { createLogger } from '../../logger/index.js';

/**
 * User unconfigure server request parameters
 */
export interface UnconfigureServerRequest {
  serverId: string;
}

/**
 * User unconfigure server response data
 */
export interface UnconfigureServerResponseData {
  serverId: string;
  message: string;
}

export class UnconfigureServerHandler {
  // Logger for UnconfigureServerHandler
  private logger = createLogger('UnconfigureServerHandler');

  constructor(private sessionStore: SessionStore) {}
  
  /**
   * Handle user unconfigure server request
   * @param userId User ID
   * @param request Unconfigure request parameters
   * @returns Promise<UnconfigureServerResponseData>
   * @throws AdminError if user not found or operation fails
   */
  async handleUnconfigureServer(
    userId: string,
    data: UnconfigureServerRequest
  ): Promise<UnconfigureServerResponseData> {
    const { serverId } = data;

    // 1. Get user
    const user = await UserRepository.findById(userId);
    if (!user) {
      throw new AdminError(`User ${userId} not found`, AdminErrorCode.INVALID_REQUEST);
    }

    // 2. Check if already configured (idempotency)
    const launchConfigs = JSON.parse(user.launchConfigs || '{}');
    if (!launchConfigs[serverId]) {
      this.logger.debug({ serverId, userId }, 'Server is not configured for user, returning success (idempotent)');
      return {
        serverId: serverId,
        message: 'Server not configured (already unconfigured)'
      };
    }

    // 3. Close temporary server (force close, don't wait for pending requests)
    try {
      await ServerManager.instance.closeTemporaryServer(serverId, userId);
      this.logger.info({ serverId, userId }, 'Closed temporary server for user');
    } catch (error: any) {
      this.logger.warn({ error: error.message, serverId, userId }, 'Failed to close temporary server for user');
      // Continue execution, as server may already not exist or be closed
    }

    // 4. Clean up launchConfigs
    delete launchConfigs[serverId];
    await UserRepository.updateLaunchConfigs(userId, launchConfigs);
    this.logger.debug({ serverId, userId }, 'Removed server from user launchConfigs');

    // 5. Clean up userPreferences
    const userPreferences = JSON.parse(user.userPreferences || '{}');
    if (userPreferences[serverId]) {
      delete userPreferences[serverId];
      await UserRepository.updateUserPreferences(userId, userPreferences);
      this.logger.debug({ serverId, userId }, 'Removed server from user userPreferences');
    }

    // 6. Notify all related users (using unified notification method)
    await socketNotifier.notifyUserPermissionChangedByServer(serverId);

    // 7. Notify all active sessions
    await this.sessionStore.updateUserPreferences(userId);

    this.logger.info({ serverId, userId }, 'User successfully unconfigured server');

    return {
      serverId: serverId,
      message: 'Server unconfigured successfully'
    };
  }
}

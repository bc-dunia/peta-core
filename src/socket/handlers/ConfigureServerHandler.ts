/**
 * ConfigureServerHandler - Socket user configure server handler
 *
 * Handles user requests to configure server launch commands via Socket.IO
 */

import { ServerRepository } from '../../repositories/ServerRepository.js';
import { UserRepository } from '../../repositories/UserRepository.js';
import { CryptoService } from '../../security/CryptoService.js';
import { ServerManager } from '../../mcp/core/ServerManager.js';
import { AdminError, AdminErrorCode } from '../../types/admin.types.js';
import { CapabilitiesService } from '../../mcp/services/CapabilitiesService.js';
import { socketNotifier } from '../SocketNotifier.js';
import { Server } from '@prisma/client';
import { SessionStore } from '../../mcp/core/SessionStore.js';
import { createLogger } from '../../logger/index.js';
import { ServerAuthType } from '../../types/enums.js';

/**
 * User configure server request parameters
 */
export interface ConfigureServerRequest {
  serverId: string;
  authConf: Array<{
    key: string;
    value: string;
    dataType: number;
  }>;
}

/**
 * User configure server response data
 */
export interface ConfigureServerResponseData {
  serverId: string;      // Original serverId (not concatenated)
  message: string;
}

export class ConfigureServerHandler {
  // Logger for ConfigureServerHandler
  private logger = createLogger('ConfigureServerHandler');

  constructor(private sessionStore: SessionStore) {}

  /**
   * Handle user configure server request
   * @param userId User ID
   * @param userToken User token (used to encrypt launchConfig)
   * @param request Configuration request parameters
   * @returns Promise<ConfigureServerResponseData>
   * @throws AdminError if validation fails or operation fails
   */
  async handleConfigureServer(
    userId: string,
    userToken: string,
    data: ConfigureServerRequest
  ): Promise<ConfigureServerResponseData> {
    const { serverId, authConf } = data;

    // 1. Validate server exists and allowUserInput=true and enabled=true
    const server = await ServerRepository.findByServerId(serverId);

    if (!server) {
      throw new AdminError(`Server ${serverId} not found`, AdminErrorCode.SERVER_NOT_FOUND);
    }

    if (!server.allowUserInput) {
      throw new AdminError(`Server ${serverId} does not allow user input`, AdminErrorCode.INVALID_REQUEST);
    }

    if (!server.enabled) {
      throw new AdminError(`Server ${serverId} is disabled`, AdminErrorCode.INVALID_REQUEST);
    }

    if (!server.configTemplate) {
      throw new AdminError(`Server ${serverId} does not have a configuration template`, AdminErrorCode.INVALID_REQUEST);
    }

    // 2. Assemble and encrypt launchConfig
    const launchConfig = this.assembleLaunchConfig(server.configTemplate, authConf);
    const launchConfigStr = JSON.stringify(launchConfig);
    const encryptedLaunchConfig = await CryptoService.encryptData(launchConfigStr, userToken);

    // 3. Save to user.launchConfigs
    const user = await UserRepository.findById(userId);
    if (!user) {
      throw new AdminError(`User ${userId} not found`, AdminErrorCode.INVALID_REQUEST);
    }

    const launchConfigs = JSON.parse(user.launchConfigs || '{}');
    launchConfigs[serverId] = encryptedLaunchConfig;

    await UserRepository.updateLaunchConfigs(userId, launchConfigs);

    let launchConfigsStr = JSON.stringify(launchConfigs);
    const userSessions = this.sessionStore.getUserSessions(userId);
    for (const session of userSessions) {
      session.launchConfigs = launchConfigsStr;
    }
    
    // 4. Immediately start temporary server
    // Create a new Server entity using the assembled launchConfig
    const tempServerEntity: Server = {
      ...server,
      launchConfig: JSON.stringify(encryptedLaunchConfig)
    };

    const serverContext = await ServerManager.instance.createTemporaryServer(
      userId,
      tempServerEntity,
      userToken
    );

    // 5. After server connection succeeds, store capabilities to user.userPreferences
    // ServerContext automatically gets capabilities after connection succeeds
    // We need to store these capabilities to userPreferences
    const userPreferences = JSON.parse(user.userPreferences || '{}');

    // Get server's actual capabilities
    const mcpCapabilities = serverContext.getMcpCapabilities();
    userPreferences[serverId] = mcpCapabilities;

    await UserRepository.updateUserPreferences(userId, userPreferences);

    // 6. Notify all user clients
    socketNotifier.notifyPermissionChangedByUser(userId);

    // 7. Notify all active sessions
    await this.sessionStore.updateUserPreferences(userId);

    this.logger.info({ userId, serverId }, 'User successfully configured server');

    return {
      serverId: serverId,
      message: 'Server configured and started successfully'
    };
  }

  /**
   * Assemble launchConfig
   * @param configTemplate Configuration template in JSON string format
   * @param authConf Authentication configuration provided by user
   * @returns Assembled launchConfig object
   */
  private assembleLaunchConfig(
    configTemplate: string,
    authConf: Array<{ key: string; value: string; dataType: number }>
  ): any {
    // 1. Parse configTemplate
    let template: any;
    try {
      template = JSON.parse(configTemplate);
    } catch (error: any) {
      throw new AdminError(`Invalid configTemplate JSON: ${error.message}`, AdminErrorCode.INVALID_REQUEST);
    }

    // 2. Extract mcpJsonConf
    if (!template.mcpJsonConf) {
      throw new AdminError('configTemplate must contain mcpJsonConf field', AdminErrorCode.INVALID_REQUEST);
    }

    // 3. Parse mcpJsonConf
    let mcpJsonConf = template.mcpJsonConf;

    // 4. Deep copy configuration object
    let processedConfig = JSON.parse(JSON.stringify(mcpJsonConf));

    // 5. Validate and apply authConf
    if (!authConf || authConf.length === 0) {
      throw new AdminError('authConf is required and cannot be empty', AdminErrorCode.INVALID_REQUEST);
    }

    for (const auth of authConf) {
      // Validate input
      if (!auth.key || typeof auth.key !== 'string') {
        throw new AdminError(`Invalid auth.key: ${auth.key}`, AdminErrorCode.INVALID_REQUEST);
      }

      if (auth.value === undefined || auth.value === null || typeof auth.value !== 'string') {
        throw new AdminError(`Invalid auth.value for key: ${auth.key}`, AdminErrorCode.INVALID_REQUEST);
      }

      if (auth.dataType === 1) {
        // String replacement method
        const configStr = JSON.stringify(processedConfig);

        // Check if key exists in configuration
        if (!configStr.includes(auth.key)) {
          this.logger.warn({ key: auth.key }, 'Placeholder not found in configuration');
        }

        // Execute replacement (use split/join to avoid regex injection)
        const updatedConfigStr = configStr.split(auth.key).join(auth.value);

        // Validate JSON validity after replacement
        try {
          processedConfig = JSON.parse(updatedConfigStr);
        } catch (error: any) {
          throw new AdminError(`Configuration became invalid after credential replacement: ${error.message}`, AdminErrorCode.INVALID_REQUEST);
        }
      }
      // TODO: Support other dataTypes (if needed in the future)
    }

    if (template.authType === ServerAuthType.NotionAuth && !processedConfig.oauth.expiresAt) {
      processedConfig.oauth.expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    } else if (template.authType === ServerAuthType.FigmaAuth && !processedConfig.oauth.expiresAt) {
      processedConfig.oauth.expiresAt = Date.now() + 90 * 24 * 60 * 60 * 1000;
    }
    return processedConfig;
  }
}

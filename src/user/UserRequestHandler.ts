/**
 * UserRequestHandler - Core business logic layer (transport-agnostic)
 *
 * This module handles all user-related business operations independently of
 * the transport protocol (HTTP API or Socket.IO). Both UserController (HTTP)
 * and SocketService (Socket) call methods in this handler.
 *
 * Architecture:
 * - Layer 1 (this file): Business logic (transport-agnostic)
 * - Layer 2a: Socket.IO communication layer
 * - Layer 2b: HTTP API layer
 */

import { SessionStore } from '../mcp/core/SessionStore.js';
import { McpServerCapabilities } from '../mcp/types/mcp.js';
import { createLogger } from '../logger/index.js';
import { socketNotifier } from '../socket/SocketNotifier.js';
import {
  UserError,
  UserErrorCode,
  SessionData,
  ConfigureServerRequest,
  ConfigureServerResponseData,
  UnconfigureServerRequest,
  UnconfigureServerResponseData
} from './types.js';

export class UserRequestHandler {
  private logger = createLogger('UserRequestHandler');

  static instance: UserRequestHandler = new UserRequestHandler();
  static getInstance(): UserRequestHandler {
    return UserRequestHandler.instance;
  }

  private constructor() {}

  /**
   * Handle GET_CAPABILITIES: Get user's capability configuration
   *
   * @param userId - User ID
   * @returns Promise<McpServerCapabilities> - Complete capability configuration
   *
   */
  async handleGetCapabilities(userId: string): Promise<McpServerCapabilities> {
    this.logger.debug({ userId }, 'Getting user capabilities');

    // Import dynamically to avoid circular dependency
    const { CapabilitiesService } = await import('../mcp/services/CapabilitiesService.js');
    const capabilitiesService = CapabilitiesService.getInstance();
    const capabilities = await capabilitiesService.getUserCapabilities(userId);

    this.logger.debug({ userId }, 'User capabilities retrieved successfully');
    return capabilities;
  }

  /**
   * Handle SET_CAPABILITIES: Set user's capability configuration
   *
   * @param userId - User ID
   * @param submittedCapabilities - User-submitted capability configuration
   * @returns Promise<void>
   *
   */
  async handleSetCapabilities(
    userId: string,
    submittedCapabilities: McpServerCapabilities
  ): Promise<void> {
    this.logger.debug({ userId }, 'Setting user capabilities');

    // Import dependencies dynamically
    const UserRepository = (await import('../repositories/UserRepository.js')).default;

    // 1. Get current complete capabilities (for validation)
    const currentCapabilities = await this.handleGetCapabilities(userId);

    // 2. Extract and validate enabled fields (only save enabled for existing items)
    const validatedPreferences = this.extractEnabledFields(submittedCapabilities, currentCapabilities);

    // 3. Update database
    await UserRepository.update(userId, {
      userPreferences: JSON.stringify(validatedPreferences)
    });

    this.logger.info({ userId }, 'User preferences updated');

    // 4. Notify all active sessions
    await SessionStore.instance.updateUserPreferences(userId);
  }

  /**
   * Extract and validate enabled fields
   *
   * Only save enabled status for server/tool/resource/prompt that exist in current.
   * Ignore other fields and non-existent items.
   *
   * @param submitted - User submitted complete configuration
   * @param current - Current actual complete configuration (for validation)
   * @returns Validated user_preferences (only contains enabled fields)
   *
   */
  private extractEnabledFields(
    submitted: McpServerCapabilities,
    current: McpServerCapabilities
  ): McpServerCapabilities {
    const validated: McpServerCapabilities = {};

    // Iterate through each server submitted by user
    for (const [serverId, serverConfig] of Object.entries(submitted)) {
      // Check if server exists
      if (!current[serverId]) {
        this.logger.debug({ serverId }, 'Skipping unknown serverId');
        continue;
      }

      const currentServer = current[serverId] as any;
      const submittedServer = serverConfig as any;

      // Initialize configuration for this server
      validated[serverId] = {
        enabled: typeof submittedServer.enabled === 'boolean' ? submittedServer.enabled : true,
        serverName: currentServer.serverName,
        tools: {},
        resources: {},
        prompts: {}
      } as any;

      // Extract enabled for tools
      if (submittedServer.tools) {
        for (const [toolName, toolConfig] of Object.entries(submittedServer.tools)) {
          if (currentServer.tools && currentServer.tools[toolName]) {
            const tc = toolConfig as any;
            if (typeof tc.enabled === 'boolean') {
              validated[serverId].tools[toolName] = {
                enabled: tc.enabled,
                description: tc.description,
                dangerLevel: tc.dangerLevel
              };
            }
          } else {
            this.logger.debug({ serverId, toolName }, 'Skipping unknown tool');
          }
        }
      }

      // Extract enabled for resources
      if (submittedServer.resources) {
        for (const [resourceName, resourceConfig] of Object.entries(submittedServer.resources)) {
          if (currentServer.resources && currentServer.resources[resourceName]) {
            const rc = resourceConfig as any;
            if (typeof rc.enabled === 'boolean') {
              validated[serverId].resources[resourceName] = {
                enabled: rc.enabled,
                description: rc.description
              };
            }
          } else {
            this.logger.debug({ serverId, resourceName }, 'Skipping unknown resource');
          }
        }
      }

      // Extract enabled for prompts
      if (submittedServer.prompts) {
        for (const [promptName, promptConfig] of Object.entries(submittedServer.prompts)) {
          if (currentServer.prompts && currentServer.prompts[promptName]) {
            const pc = promptConfig as any;
            if (typeof pc.enabled === 'boolean') {
              validated[serverId].prompts[promptName] = {
                enabled: pc.enabled,
                description: pc.description
              };
            }
          } else {
            this.logger.debug({ serverId, promptName }, 'Skipping unknown prompt');
          }
        }
      }

      // If this server has no valid configuration, delete it
      if (
        validated[serverId].enabled === undefined &&
        Object.keys(validated[serverId].tools).length === 0 &&
        Object.keys(validated[serverId].resources).length === 0 &&
        Object.keys(validated[serverId].prompts).length === 0
      ) {
        delete validated[serverId];
      }
    }

    return validated;
  }

  /**
   * Handle CONFIGURE_SERVER: Configure a server for user
   *
   * @param userId - User ID
   * @param userToken - User token (for encrypting launchConfig)
   * @param data - Configuration request data
   * @returns Promise<ConfigureServerResponseData> - Configuration result
   *
   */
  async handleConfigureServer(
    userId: string,
    userToken: string,
    data: ConfigureServerRequest
  ): Promise<ConfigureServerResponseData> {
    const { serverId, authConf } = data;
    this.logger.debug({ userId, serverId }, 'Configuring server for user');

    // Import dependencies dynamically
    const { ServerRepository } = await import('../repositories/ServerRepository.js');
    const UserRepository = (await import('../repositories/UserRepository.js')).default;
    const { CryptoService } = await import('../security/CryptoService.js');
    const { ServerManager } = await import('../mcp/core/ServerManager.js');
    const { ServerAuthType } = await import('../types/enums.js');

    // 1. Validate server exists and allowUserInput=true and enabled=true
    const server = await ServerRepository.findByServerId(serverId);

    if (!server) {
      throw new UserError(`Server ${serverId} not found`, UserErrorCode.SERVER_NOT_FOUND);
    }

    if (!server.allowUserInput) {
      throw new UserError(
        `Server ${serverId} does not allow user input`,
        UserErrorCode.SERVER_NOT_ALLOW_USER_INPUT
      );
    }

    if (!server.enabled) {
      throw new UserError(`Server ${serverId} is disabled`, UserErrorCode.SERVER_DISABLED);
    }

    if (!server.configTemplate) {
      throw new UserError(
        `Server ${serverId} does not have a configuration template`,
        UserErrorCode.SERVER_NO_CONFIG_TEMPLATE
      );
    }

    // 2. Assemble and encrypt launchConfig
    const launchConfig = this.assembleLaunchConfig(server.configTemplate, authConf);
    const launchConfigStr = JSON.stringify(launchConfig);
    const encryptedLaunchConfig = await CryptoService.encryptData(launchConfigStr, userToken);

    // 3. Save to user.launchConfigs
    const user = await UserRepository.findById(userId);
    if (!user) {
      throw new UserError(`User ${userId} not found`, UserErrorCode.INTERNAL_ERROR);
    }

    const launchConfigs = JSON.parse(user.launchConfigs || '{}');
    launchConfigs[serverId] = encryptedLaunchConfig;

    await UserRepository.updateLaunchConfigs(userId, launchConfigs);

    const launchConfigsStr = JSON.stringify(launchConfigs);
    const userSessions = SessionStore.instance.getUserSessions(userId);
    for (const session of userSessions) {
      session.launchConfigs = launchConfigsStr;
    }

    // 4. Immediately start temporary server
    const tempServerEntity: any = {
      ...server,
      launchConfig: JSON.stringify(encryptedLaunchConfig)
    };

    const serverContext = await ServerManager.instance.createTemporaryServer(
      userId,
      tempServerEntity,
      userToken
    );

    // 5. Store capabilities to user.userPreferences
    const userPreferences = JSON.parse(user.userPreferences || '{}');
    const mcpCapabilities = serverContext.getMcpCapabilities();
    userPreferences[serverId] = mcpCapabilities;

    await UserRepository.updateUserPreferences(userId, userPreferences);

    // 6. Notify all user clients (if socketNotifier is available)
    socketNotifier.notifyPermissionChangedByUser(userId);

    // 7. Notify all active sessions
    await SessionStore.instance.updateUserPreferences(userId);

    this.logger.info({ userId, serverId }, 'User successfully configured server');

    return {
      serverId: serverId,
      message: 'Server configured and started successfully'
    };
  }

  /**
   * Assemble launchConfig from template and user-provided credentials
   *
   * @param configTemplate - Configuration template in JSON string format
   * @param authConf - Authentication configuration provided by user
   * @returns Assembled launchConfig object
   *
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
      throw new UserError(
        `Invalid configTemplate JSON: ${error.message}`,
        UserErrorCode.SERVER_CONFIG_INVALID
      );
    }

    // 2. Extract mcpJsonConf
    if (!template.mcpJsonConf) {
      throw new UserError(
        'configTemplate must contain mcpJsonConf field',
        UserErrorCode.SERVER_CONFIG_INVALID
      );
    }

    // 3. Parse mcpJsonConf
    const mcpJsonConf = template.mcpJsonConf;

    // 4. Deep copy configuration object
    let processedConfig = JSON.parse(JSON.stringify(mcpJsonConf));

    // 5. Validate and apply authConf
    if (!authConf || authConf.length === 0) {
      throw new UserError(
        'authConf is required and cannot be empty',
        UserErrorCode.SERVER_CONFIG_INVALID
      );
    }

    for (const auth of authConf) {
      // Validate input
      if (!auth.key || typeof auth.key !== 'string') {
        throw new UserError(`Invalid auth.key: ${auth.key}`, UserErrorCode.SERVER_CONFIG_INVALID);
      }

      if (auth.value === undefined || auth.value === null || typeof auth.value !== 'string') {
        throw new UserError(
          `Invalid auth.value for key: ${auth.key}`,
          UserErrorCode.SERVER_CONFIG_INVALID
        );
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
          throw new UserError(
            `Configuration became invalid after credential replacement: ${error.message}`,
            UserErrorCode.SERVER_CONFIG_INVALID
          );
        }
      }
      // TODO: Support other dataTypes (if needed in the future)
    }

    // Handle OAuth expiration dates dynamically
    const { ServerAuthType } = require('../types/enums.js');
    if (template.authType === ServerAuthType.NotionAuth && !processedConfig.oauth?.expiresAt) {
      processedConfig.oauth = processedConfig.oauth || {};
      processedConfig.oauth.expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    } else if (template.authType === ServerAuthType.FigmaAuth && !processedConfig.oauth?.expiresAt) {
      processedConfig.oauth = processedConfig.oauth || {};
      processedConfig.oauth.expiresAt = Date.now() + 90 * 24 * 60 * 60 * 1000;
    }

    return processedConfig;
  }

  /**
   * Handle UNCONFIGURE_SERVER: Unconfigure a server for user
   *
   * @param userId - User ID
   * @param data - Unconfiguration request data
   * @returns Promise<UnconfigureServerResponseData> - Unconfiguration result
   *
   */
  async handleUnconfigureServer(
    userId: string,
    data: UnconfigureServerRequest
  ): Promise<UnconfigureServerResponseData> {
    const { serverId } = data;
    this.logger.debug({ userId, serverId }, 'Unconfiguring server for user');

    // Import dependencies dynamically
    const UserRepository = (await import('../repositories/UserRepository.js')).default;
    const { ServerManager } = await import('../mcp/core/ServerManager.js');

    // 1. Get user
    const user = await UserRepository.findById(userId);
    if (!user) {
      throw new UserError(`User ${userId} not found`, UserErrorCode.INTERNAL_ERROR);
    }

    // 2. Check if already configured (idempotency)
    const launchConfigs = JSON.parse(user.launchConfigs || '{}');
    if (!launchConfigs[serverId]) {
      this.logger.debug({ serverId, userId }, 'Server not configured, returning success (idempotent)');
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
      this.logger.warn({ error: error.message, serverId, userId }, 'Failed to close temporary server');
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

    // 6. Notify all related users (if socketNotifier is available)
    await socketNotifier.notifyUserPermissionChangedByServer(serverId);

    // 7. Notify all active sessions
    await SessionStore.instance.updateUserPreferences(userId);

    this.logger.info({ serverId, userId }, 'User successfully unconfigured server');

    return {
      serverId: serverId,
      message: 'Server unconfigured successfully'
    };
  }

  /**
   * Handle GET_ONLINE_SESSIONS: Get user's online session list
   *
   * @param userId - User ID
   * @returns Promise<SessionData[]> - List of online sessions
   *
   * New implementation - migrates data building logic from SocketNotifier.notifyOnlineSessions
   */
  async handleGetOnlineSessions(userId: string): Promise<SessionData[]> {
    this.logger.debug({ userId }, 'Getting user online sessions');

    // Import ClientSession type dynamically
    const { ClientSession } = await import('../mcp/core/ClientSession.js');

    // Get all MCP ClientSessions for the user
    const sessions = SessionStore.instance.getUserSessions(userId);

    // Build session data
    const sessionData = sessions.map((session: any) => ({
      sessionId: session.sessionId,
      clientName: session.clientInfo?.name || 'Unknown Client',
      userAgent: session.authContext.userAgent || 'Unknown',
      lastActive: session.lastActive
    }));

    this.logger.debug({ userId, count: sessionData.length }, 'Retrieved user online sessions');
    return sessionData;
  }
}

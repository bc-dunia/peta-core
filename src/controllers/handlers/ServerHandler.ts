import { SessionStore } from '../../mcp/core/SessionStore.js';
import { ServerManager } from '../../mcp/core/ServerManager.js';
import { ServerRepository } from '../../repositories/ServerRepository.js';
import { AuthUtils } from '../../utils/AuthUtils.js';
import { AdminRequest, AdminError, AdminErrorCode } from '../../types/admin.types.js';
import { Server } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { LogService } from '../../log/LogService.js';
import { MCPEventLogType, ServerCategory, ServerStatus } from '../../types/enums.js';
import { socketNotifier } from '../../socket/SocketNotifier.js';
import { ServerContext } from '../../mcp/core/ServerContext.js';
import { Permissions } from '../../mcp/types/mcp.js';
import UserRepository from '../../repositories/UserRepository.js';
import { ClientSession } from '../../mcp/core/ClientSession.js';
import { createLogger } from '../../logger/index.js';

/**
 * Server operation handler (2000-2999)
 */
export class ServerHandler {
  private serverRepository = ServerRepository;
  
  // Logger for ServerHandler
  private logger = createLogger('ServerHandler');

  constructor(
    private sessionStore: SessionStore,
    private serverManager: ServerManager
  ) {}

  /**
   * Start server (2001)
   */
  async handleStartServer(request: AdminRequest<any>, token: string): Promise<any> {
    const { targetId } = request.data;

    // Find server configuration
    let serverEntity = await ServerRepository.findByServerId(targetId);
    if (!serverEntity) {
      throw new AdminError(`Server ${targetId} not found`, AdminErrorCode.SERVER_NOT_FOUND);
    }

    serverEntity = await ServerRepository.update(targetId, { enabled: true });

    if (serverEntity.allowUserInput === true) {
      return null;
    }

    // Check if launchConfig is empty (template servers cannot be started directly)
    if (!serverEntity.launchConfig || serverEntity.launchConfig.trim() === '') {
      throw new AdminError(
        `Cannot start template server ${targetId}. Users must configure it first through client.`,
        AdminErrorCode.INVALID_REQUEST
      );
    }

    const serverContext = await this.serverManager.addServer(serverEntity, token);

    const changed = {
      toolsChanged: (serverContext.tools?.tools?.length ?? 0) > 0,
      resourcesChanged: (serverContext.resources?.resources?.length ?? 0) > 0,
      promptsChanged: (serverContext.prompts?.prompts?.length ?? 0) > 0
    };

    // Notify related users of server capability changes
    this.notifyUsersOfServerChange(targetId, this.sessionStore.getSessionsUsingServer(targetId), 'server_started', changed);

    // Log audit event
    AuthUtils.logAuthEvent('server_started', undefined, targetId, true, JSON.stringify(changed));

    return null;
  }

  /**
   * Stop server (2002)
   */
  async handleStopServer(request: AdminRequest<any>): Promise<any> {
    const { targetId } = request.data;
    await this.stopServer(targetId);
    return null;
  }

  /**
   * Update server capabilities configuration (2003)
   */
  async handleUpdateServerCapabilities(request: AdminRequest<any>): Promise<any> {
    const { targetId, capabilities } = request.data;

    const entity = await ServerRepository.findByServerId(targetId);
    if (!entity) {
      throw new AdminError(`Server ${targetId} not found`, AdminErrorCode.SERVER_NOT_FOUND);
    }

    const updatedCapabilities = await this.getUpdatedCapabilities(capabilities, entity.capabilities);
    if (!updatedCapabilities) {
      return null;
    }

    await this.updateServerCapabilities(targetId, updatedCapabilities);

    // Log admin operation
    LogService.getInstance().enqueueLog({
      action: MCPEventLogType.AdminServerEdit,
      requestParams: JSON.stringify({ targetId: targetId, capabilities: capabilities })
    });

    return null;
  }

  /**
   * Update server launch command (2004)
   */
  async handleUpdateServerLaunchCmd(request: AdminRequest<any>, token: string): Promise<any> {
    const { targetId, launchConfig } = request.data;
    await this.updateServerLaunchConfig(targetId, launchConfig, token);

    // Log admin operation
    LogService.getInstance().enqueueLog({
      action: MCPEventLogType.AdminServerEdit,
      requestParams: JSON.stringify({ targetId: targetId })
    });

    return null;
  }

  /**
   * Connect all servers (2005)
   */
  async handleConnectAllServers(request: AdminRequest<any>, token: string): Promise<{ successServers: { serverId: string; serverName: string; proxyId: number }[]; failedServers: { serverId: string; serverName: string; proxyId: number }[] }> {
    const { successServers, failedServers } = await this.serverManager.connectAllServers(token);

    for (const server of successServers) {
      const serveContext = this.serverManager.getServerContext(server.serverId);
      this.notifyUsersOfServerChange(server.serverId, this.sessionStore.getSessionsUsingServer(server.serverId), 'server_started', {
        toolsChanged: (serveContext?.tools?.tools?.length ?? 0) > 0,
        resourcesChanged: (serveContext?.resources?.resources?.length ?? 0) > 0,
        promptsChanged: (serveContext?.prompts?.prompts?.length ?? 0) > 0
      });
    }

    this.logger.debug({ successServers, failedServers }, 'Server batch start result');

    return {
      successServers: successServers,
      failedServers: failedServers
    };
  }

  /**
   * Create server (2010)
   */
  async handleCreateServer(request: AdminRequest<any>): Promise<any> {
    const { serverId, serverName, enabled, launchConfig, capabilities, createdAt, updatedAt, allowUserInput, proxyId, toolTmplId, authType, configTemplate, category, lazyStartEnabled } = request.data;

    if (!serverId) {
      throw new AdminError('Missing required field: serverId', AdminErrorCode.INVALID_REQUEST);
    }

    // Check if server already exists
    const existingServer = await ServerRepository.findByServerId(serverId);
    if (existingServer) {
      throw new AdminError('Server already exists', AdminErrorCode.SERVER_ALREADY_EXISTS);
    }

    // launchConfig must be a string
    if (typeof launchConfig !== 'string') {
      throw new AdminError('launchConfig must be a string', AdminErrorCode.INVALID_REQUEST);
    }

    // Validate consistency between allowUserInput and configTemplate
    const allowUserInputValue = allowUserInput ?? false;

    if (allowUserInputValue === true) {
      if (!configTemplate || configTemplate.trim() === '' || configTemplate.trim() === '{}') {
        throw new AdminError(
          'For servers with allowUserInput=true, configTemplate is required',
          AdminErrorCode.INVALID_REQUEST
        );
      }
    }

    if (typeof category !== 'number' || !Object.values(ServerCategory).includes(category as ServerCategory)) {
      throw new AdminError('Invalid category', AdminErrorCode.INVALID_REQUEST);
    }

    const server = await ServerRepository.create({
      serverId,
      serverName: serverName ?? '',
      enabled: enabled ?? true,
      launchConfig: launchConfig,
      capabilities: JSON.stringify({tools: {}, resources: {}, prompts: {}}),
      createdAt: createdAt ?? Math.floor(Date.now() / 1000),
      updatedAt: updatedAt ?? Math.floor(Date.now() / 1000),
      allowUserInput: allowUserInputValue,
      proxyId: proxyId ?? 0,
      toolTmplId: toolTmplId ?? null,
      authType: authType ?? 1,
      configTemplate: configTemplate || '{}',
      category: category,
      lazyStartEnabled: lazyStartEnabled
    });

    // Log admin operation
    LogService.getInstance().enqueueLog({
      action: MCPEventLogType.AdminServerCreate,
      requestParams: JSON.stringify({ serverId: serverId, authType: authType })
    });

    return { server : server };
  }

  /**
   * Query server list (2011)
   */
  async handleGetServers(request: AdminRequest<any>): Promise<any> {
    const { proxyId, enabled, serverId } = request.data || {};

    // Select fields to exclude: transportType, cachedTools, cachedResources, cachedResourceTemplates, cachedPrompts
    const select = {
      serverId: true,
      serverName: true,
      enabled: true,
      launchConfig: true,
      capabilities: true,
      createdAt: true,
      updatedAt: true,
      allowUserInput: true,
      configTemplate: true,
      proxyId: true,
      toolTmplId: true,
      authType: true,
      category: true,
      lazyStartEnabled: true
    };

    // Exact query for specific server
    if (serverId) {
      const server = await prisma.server.findUnique({
        where: { serverId },
        select
      });
      if (server && server.category !== ServerCategory.RestApi) {
        server.configTemplate = null;
      }
      return { servers: server ? [server] : [] };
    }

    // Build query conditions
    const where: any = {};
    if (proxyId !== undefined) {
      where.proxyId = proxyId;
    }
    if (enabled !== undefined) {
      where.enabled = enabled;
    }

    const servers = await prisma.server.findMany({ where, select });
    for (const server of servers) {
      if (server.category !== ServerCategory.RestApi) {
        server.configTemplate = null;
      }
    }
    return { servers : servers };
  }

  /**
   * Update server (2012)
   */
  async handleUpdateServer(request: AdminRequest<any>, token: string): Promise<any> {
    const { serverId, serverName, launchConfig, capabilities, enabled, allowUserInput, configTemplate, lazyStartEnabled } = request.data;

    if (!serverId) {
      throw new AdminError('Missing required field: serverId', AdminErrorCode.INVALID_REQUEST);
    }

    // Check if server exists
    const existingServer = await ServerRepository.findByServerId(serverId);
    if (!existingServer) {
      throw new AdminError('Server not found', AdminErrorCode.SERVER_NOT_FOUND);
    }

    // Prevent modification of allowUserInput and configTemplate
    if (allowUserInput !== undefined && allowUserInput !== existingServer.allowUserInput) {
      throw new AdminError(
        'allowUserInput field is immutable after server creation',
        AdminErrorCode.INVALID_REQUEST
      );
    }
    if (existingServer.category !== ServerCategory.RestApi && configTemplate !== undefined) {
      throw new AdminError(
        'configTemplate field is immutable after server creation',
        AdminErrorCode.INVALID_REQUEST
      );
    }

    // Prepare update data
    const updateData: any = {};
    if (serverName !== undefined) updateData.serverName = serverName;
    if (launchConfig !== undefined) {
      updateData.launchConfig = typeof launchConfig === 'string' ? launchConfig : JSON.stringify(launchConfig);
    }
    if (existingServer.category === ServerCategory.RestApi && configTemplate !== undefined) {
      updateData.configTemplate = configTemplate;
    }
    if (lazyStartEnabled !== undefined) {
      updateData.lazyStartEnabled = lazyStartEnabled;
    }

    const updatedCapabilities = await this.getUpdatedCapabilities(capabilities, existingServer.capabilities);
    if (updatedCapabilities) {
      updateData.capabilities = updatedCapabilities;
    }
    updateData.enabled = enabled ?? existingServer.enabled;

    let server = await ServerRepository.update(serverId, updateData);
    let serverContext: ServerContext | undefined;
    const affectedSessions = this.sessionStore.getSessionsUsingServer(serverId);
    if (existingServer.enabled === true && updateData.enabled === true) {
      // Server remains enabled
      if (updateData.capabilities !== undefined && updateData.launchConfig !== undefined) {
        this.updateServerLaunchConfig(serverId, updateData.launchConfig, token);
      } else if (updateData.capabilities !== undefined) {
        await this.updateServerCapabilities(serverId, updateData.capabilities);
        serverContext = await this.updateLazyStartEnabled(existingServer, updateData.lazyStartEnabled);
      } else if (updateData.launchConfig !== undefined) {
        this.updateServerLaunchConfig(serverId, updateData.launchConfig, token);
      } else if (updateData.lazyStartEnabled !== undefined) {
        serverContext = await this.updateLazyStartEnabled(existingServer, updateData.lazyStartEnabled);
      }
    } else if (existingServer.enabled === true && updateData.enabled === false) {
      // Server changed from enabled to disabled
      if (existingServer.allowUserInput) {
        const temporaryServers = this.serverManager.getTemporaryServers(serverId);
        if (temporaryServers.length > 0) {
          serverContext = temporaryServers[0];
        }
        await this.serverManager.closeAllTemporaryServersByTemplate(serverId);
      } else {
        serverContext = await this.serverManager.removeServer(serverId);
      }

    } else if (existingServer.enabled === false && updateData.enabled === true) {
      // Server changed from disabled to enabled
      serverContext = await this.serverManager.addServer(serverId, token);
    }

    if (serverContext) {
      const changed = {
        toolsChanged: (serverContext?.tools?.tools?.length ?? 0) > 0,
        resourcesChanged: (serverContext?.resources?.resources?.length ?? 0) > 0,
        promptsChanged: (serverContext?.prompts?.prompts?.length ?? 0) > 0
      };
      this.notifyUsersOfServerChange(serverId, affectedSessions, 'server_updated', changed);
    }
    // Log admin operation
    LogService.getInstance().enqueueLog({
      action: MCPEventLogType.AdminServerEdit,
      requestParams: JSON.stringify({ serverId: serverId })
    });

    server.configTemplate = null;
    server.transportType = null;
    server.cachedTools = null;
    server.cachedResources = null;
    server.cachedResourceTemplates = null;
    server.cachedPrompts = null;

    return { server: server };
  }

  /**
   * Delete server (2013)
   */
  async handleDeleteServer(request: AdminRequest<any>): Promise<any> {
    const { serverId } = request.data;

    if (!serverId) {
      throw new AdminError('Missing required field: serverId', AdminErrorCode.INVALID_REQUEST);
    }

    // If it's a template server (allowUserInput=true), clean up all user configurations
    const server = await ServerRepository.findByServerId(serverId);
    if (!server) {
      throw new AdminError('Server not found', AdminErrorCode.SERVER_NOT_FOUND);
    }
    if (server.allowUserInput) {
      // 1. Close all temporary servers based on this template
      await this.serverManager.closeAllTemporaryServersByTemplate(serverId);

      // 2. Clean up all users' launchConfigs and userPreferences
      await UserRepository.removeServerFromAllUsers(serverId);

      this.logger.info({ serverId }, 'Cleaned up all user configurations for template server');
    }

    const affectedSessions = this.sessionStore.getSessionsUsingServer(serverId);
    await ServerRepository.delete(serverId);
    

    // Log admin operation
    LogService.getInstance().enqueueLog({
      action: MCPEventLogType.AdminServerDelete,
      requestParams: JSON.stringify({ serverId: serverId })
    });

    // Notify all related users of server capability changes
    let changed;
    if (server.allowUserInput) {
      changed = {
        toolsChanged: true,
        resourcesChanged: true,
        promptsChanged: true
      };
    } else {
      const serverContext = await this.serverManager.removeServer(serverId);
      changed = {
        toolsChanged: (serverContext?.tools?.tools?.length ?? 0) > 0,
        resourcesChanged: (serverContext?.resources?.resources?.length ?? 0) > 0,
        promptsChanged: (serverContext?.prompts?.prompts?.length ?? 0) > 0
      };
    }

    this.notifyUsersOfServerChange(serverId, affectedSessions, 'server_deleted', changed);

    return { message: 'Server deleted successfully' };
  }

  /**
   * Delete servers by proxy in bulk (2014)
   */
  async handleDeleteServersByProxy(request: AdminRequest<any>): Promise<any> {
    const { proxyId } = request.data;

    if (proxyId === undefined) {
      throw new AdminError('Missing required field: proxyId', AdminErrorCode.INVALID_REQUEST);
    }

    const servers = await ServerRepository.findByProxyId(proxyId);
    for (const server of servers) {
      const affectedSessions = this.sessionStore.getSessionsUsingServer(server.serverId);
      const serverContext = await this.serverManager.removeServer(server.serverId);
      if (serverContext) {
        const changed = {
          toolsChanged: (serverContext?.tools?.tools?.length ?? 0) > 0,
          resourcesChanged: (serverContext?.resources?.resources?.length ?? 0) > 0,
          promptsChanged: (serverContext?.prompts?.prompts?.length ?? 0) > 0
        };
        this.notifyUsersOfServerChange(server.serverId, affectedSessions, 'server_deleted', changed);
      } else if (server.allowUserInput) {
        await this.serverManager.closeAllTemporaryServersByTemplate(server.serverId);
        const changed = {
          toolsChanged: true,
          resourcesChanged: true,
          promptsChanged: true
        };
        this.notifyUsersOfServerChange(server.serverId, affectedSessions, 'server_deleted', changed);
      }
    }

    const count = await ServerRepository.deleteByProxyId(proxyId);
    return { deletedCount: count };
  }

  /**
   * Count servers (2015)
   */
  async handleCountServers(request: AdminRequest<any>): Promise<any> {
    const count = await ServerRepository.countAll();
    return { count : count };
  }

  // ==================== Helper Methods ====================

  /**
   * Notify related users of server changes
   */
  private async notifyUsersOfServerChange(serverId: string, affectedSessions: ClientSession[], changeType: string, changed: { toolsChanged: boolean, resourcesChanged: boolean, promptsChanged: boolean }): Promise<void> {
    try {
      this.logger.debug({ serverId, changeType, changed }, 'Notifying users of server change');

      socketNotifier.notifyUserPermissionChangedByServer(serverId);

      if (affectedSessions.length === 0) {
        this.logger.debug({ serverId }, 'No affected sessions for server');
        return;
      }

      if (!changed.toolsChanged && !changed.resourcesChanged && !changed.promptsChanged) {
        return;
      }

      // Send capability change notification for each session
      for (const session of affectedSessions) {
        try {
          if (changed.toolsChanged) {
            session.sendToolListChanged();
          }
          if (changed.resourcesChanged) {
            session.sendResourceListChanged();
          }
          if (changed.promptsChanged) {
            session.sendPromptListChanged();
          }
        } catch (error) {
          this.logger.error({ error, sessionId: session.sessionId }, 'Failed to notify session');
        }
      }

      this.logger.info({ serverId, changeType, sessionCount: affectedSessions.length }, 'Notified sessions about server change');
    } catch (error) {
      this.logger.error({ error, serverId, changeType }, 'Error notifying users of server change');
    }
  }

  /**
   * Stop server
   */
  private async stopServer(targetId: string): Promise<void> {

    const server = await ServerRepository.findByServerId(targetId);
    if (!server) {
      throw new AdminError(`Server ${targetId} not found`, AdminErrorCode.SERVER_NOT_FOUND);
    }
    const affectedSessions = this.sessionStore.getSessionsUsingServer(targetId);
    let changed;
    if (server.allowUserInput) {
      await this.serverManager.closeAllTemporaryServersByTemplate(targetId);
      changed = {
        toolsChanged: true,
        resourcesChanged: true,
        promptsChanged: true
      };
    } else {
      const serverContext = await this.serverManager.removeServer(targetId);
      changed = {
        toolsChanged: (serverContext?.tools?.tools?.length ?? 0) > 0,
        resourcesChanged: (serverContext?.resources?.resources?.length ?? 0) > 0,
        promptsChanged: (serverContext?.prompts?.prompts?.length ?? 0) > 0
      };
    }

    await ServerRepository.update(targetId, { enabled: false });
    this.notifyUsersOfServerChange(targetId, affectedSessions, 'server_stopped', changed);
    return;
  }

  private async getUpdatedCapabilities(newCapabilities: any, oldCapabilities: string): Promise<string | undefined> {
    if (newCapabilities) {

      const newCapabilitiesString = typeof newCapabilities === 'string' ? newCapabilities : JSON.stringify(newCapabilities);
      const oldCapabilitiesString = typeof oldCapabilities === 'string' ? oldCapabilities : JSON.stringify(oldCapabilities);
      if (newCapabilitiesString === oldCapabilitiesString) {
        return undefined;
      }
      
      const newCapabilitiesObj = typeof newCapabilities === 'string' ? JSON.parse(newCapabilities) : newCapabilities;
      const oldCapabilitiesObj = oldCapabilities ? JSON.parse(oldCapabilities) : {};
      let changed = false;
      if (newCapabilitiesObj.tools && Object.keys(newCapabilitiesObj.tools).length > 0) {
        for (const [toolName, toolConfig] of Object.entries(newCapabilitiesObj.tools)) {
          oldCapabilitiesObj.tools[toolName] = toolConfig;
        }
        changed = true;
      }
      if (newCapabilitiesObj.resources && Object.keys(newCapabilitiesObj.resources).length > 0) {
        for (const [resourceName, resourceConfig] of Object.entries(newCapabilitiesObj.resources)) {
          oldCapabilitiesObj.resources[resourceName] = resourceConfig;
        }
        changed = true;
      }
      if (newCapabilitiesObj.prompts && Object.keys(newCapabilitiesObj.prompts).length > 0) {
        for (const [promptName, promptConfig] of Object.entries(newCapabilitiesObj.prompts)) {
          oldCapabilitiesObj.prompts[promptName] = promptConfig;
        }
        changed = true;
      }
      if (changed) {
        return JSON.stringify(oldCapabilitiesObj);
      } else {
        return undefined;
      }
    } else {
      return undefined;
    }
  }

  /**
   * Update server capabilities
   */
  private async updateServerCapabilities(targetId: string, capabilities: string): Promise<void> {

    await ServerRepository.updateCapabilities(targetId, capabilities);
    const changed = await this.serverManager.updateServerCapabilitiesConfig(targetId, capabilities);
    this.notifyUsersOfServerChange(targetId, this.sessionStore.getSessionsUsingServer(targetId), 'capabilities_updated', changed);
  }

  private async updateServerLaunchConfig(targetId: string, launchConfig: string, token: string): Promise<void> {
    const entity = await ServerRepository.findByServerId(targetId);

    if (!entity) {
      throw new AdminError(`Server ${targetId} not found`, AdminErrorCode.SERVER_NOT_FOUND);
    }

    if (entity.allowUserInput) {
      throw new AdminError(`Server ${targetId} is a template server and cannot be updated`, AdminErrorCode.INVALID_REQUEST);
    }

    let serverContext = this.serverManager.getServerContext(targetId);

    const oldLaunchConfig = entity.launchConfig;
    if (launchConfig === oldLaunchConfig) {
      if (entity.category !== ServerCategory.RestApi) {
        return;
      }
      
      if (entity.configTemplate === serverContext?.serverEntity.configTemplate) {
        return;
      }
    }

    const newServer = await ServerRepository.updateLaunchConfig(targetId, launchConfig);

    if (!serverContext) {
      return;
    }
    await this.serverManager.reconnectServer(newServer, token);
    await this.notifyUsersOfServerChangeByServerContext(serverContext, this.sessionStore.getSessionsUsingServer(targetId), 'launch_cmd_updated');
  }

  private async updateLazyStartEnabled(existingServer: Server, lazyStartEnabled?: boolean | undefined): Promise<ServerContext | undefined> {

    if (lazyStartEnabled === undefined) {
      return undefined;
    }
    if (lazyStartEnabled === existingServer.lazyStartEnabled) {
      return undefined;
    }

    const serverId = existingServer.serverId;
    let serverContext: ServerContext | undefined;

    if (existingServer.allowUserInput) {
      const temporaryServers = this.serverManager.getTemporaryServers(serverId);

      for (const temporaryServer of temporaryServers) {
        temporaryServer.serverEntity.lazyStartEnabled = lazyStartEnabled;
        if (lazyStartEnabled === false && existingServer.lazyStartEnabled === true) {
          if (temporaryServer.status === ServerStatus.Sleeping && this.serverManager.getOwnerToken()) {
            this.serverManager.reconnectTemporaryServer(temporaryServer.serverEntity, temporaryServer.userId!, temporaryServer.userToken!);
          }
        }
      }
    } else {
      const context = this.serverManager.getServerContext(serverId);
      if (context) {
        context.serverEntity.lazyStartEnabled = lazyStartEnabled;
        if (lazyStartEnabled === false && existingServer.lazyStartEnabled === true) {
          if (context.status === ServerStatus.Sleeping && this.serverManager.getOwnerToken()) {
            this.serverManager.reconnectServer(context.serverEntity, this.serverManager.getOwnerToken());
          }
        }
      } else {
        if (lazyStartEnabled === true && existingServer.lazyStartEnabled === false) {
          serverContext = this.serverManager.addSleepingServer(existingServer);
        }
      }
    }

    return serverContext;
  }

  private async notifyUsersOfServerChangeByServerContext(serverContext: ServerContext | undefined, affectedSessions: ClientSession[], changeType: string): Promise<void> {
    if (!serverContext) return;
    const changed = {
      toolsChanged: (serverContext?.tools?.tools?.length ?? 0) > 0,
      resourcesChanged: (serverContext?.resources?.resources?.length ?? 0) > 0,
      promptsChanged: (serverContext?.prompts?.prompts?.length ?? 0) > 0
    };
    this.notifyUsersOfServerChange(serverContext.serverID, affectedSessions, changeType, changed);
  }
}

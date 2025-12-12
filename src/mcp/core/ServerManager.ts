import { ServerContext } from './ServerContext.js';
import { ServerRepository } from '../../repositories/ServerRepository.js';
import { UserRepository } from '../../repositories/UserRepository.js';
import { DownstreamTransportFactory } from './DownstreamTransportFactory.js';
import { Client, ClientOptions } from "@modelcontextprotocol/sdk/client/index.js";
import { ServerAuthType, ServerCategory, ServerStatus } from '../../types/enums.js';
import { Permissions, ServerConfigCapabilities } from '../types/mcp.js';
import { CryptoService } from '../../security/CryptoService.js';
import { AuthStrategyFactory } from '../auth/AuthStrategyFactory.js';
import { AuthError, AuthErrorType } from '../../types/auth.types.js';
import { McpServerCapabilities } from '../types/mcp.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { GlobalRequestRouter } from './GlobalRequestRouter.js';
import { LogService } from '../../log/LogService.js';
import { SessionStore } from './SessionStore.js';
import { ServerLogger } from '../../log/ServerLogger.js';
import { MCPEventLogType } from '../../types/enums.js';
import {
  CreateMessageRequestSchema,
  ListRootsRequestSchema,
  ElicitRequestSchema,
  ToolListChangedNotificationSchema,
  ResourceListChangedNotificationSchema,
  PromptListChangedNotificationSchema,
  CancelledNotificationSchema,
  ProgressNotificationSchema,
  type CancelledNotification,
  type ProgressNotification,
  type ToolListChangedNotification,
  type ResourceListChangedNotification,
  type PromptListChangedNotification,
  ResourceUpdatedNotificationSchema,
  ResourceUpdatedNotification,
  McpError,
  ErrorCode
} from '@modelcontextprotocol/sdk/types.js';
import { APP_INFO } from '../../config/config.js';
import { Server, User } from '@prisma/client';
import { ClientSession } from './ClientSession.js';
import { socketNotifier } from '../../socket/SocketNotifier.js';
import { ProxyContext } from '../../types/mcp.types.js';
import { createLogger } from '../../logger/index.js';

/**
 * Subscription state structure
 */
interface SubscriptionState {
  subscribedSessions: Set<string>;  // Session IDs subscribed to this resource
  downstreamSubscribed: boolean;     // Whether already subscribed to downstream
}

/**
 * Global ServerContext manager
 * Manages connections to all downstream servers, shared by all client sessions
 */
export class ServerManager {
  private serverContexts: Map<string, ServerContext> = new Map();
  private serverLoggers: Map<string, ServerLogger> = new Map();
  // Temporary server storage, key format: `${serverId}:${userId}`
  private temporaryServers: Map<string, ServerContext> = new Map();
  private temporaryServerLoggers: Map<string, ServerLogger> = new Map();
  private globalRouter?: GlobalRequestRouter;
  private logService?: LogService;
  private sessionStore?: SessionStore;
  private clientOptions: ClientOptions = {
    capabilities: {
      // Declare client capabilities so server knows it can initiate reverse requests
      // sampling: {},
      // roots: { listChanged: true },
      // elicitation: {}
    }
  };

  // Resource subscription state management key: `${serverId}::${resourceUri}`
  private resourceSubscriptions: Map<string, SubscriptionState> = new Map();

  // Logger for ServerManager
  private logger = createLogger('ServerManager');

  static instance: ServerManager = new ServerManager();

  /**
   * Set dependency services
   */
  setDependencies(logService: LogService, sessionStore: SessionStore): void {
    this.logService = logService;
    this.sessionStore = sessionStore;
    this.globalRouter = GlobalRequestRouter.getInstance(logService, sessionStore);
  }
  
  /**
   * Get server context
   */
  getServerContext(serverID: string, userId?: string): ServerContext | undefined {
    const serverContext = this.serverContexts.get(serverID);
    if (serverContext) {
      return serverContext;
    }
    if (userId) {
      return this.getTemporaryServer(serverID, userId);
    }
    return undefined;
  }

  getServerContextByID(id: string): ServerContext | undefined {
    return Array.from(this.serverContexts.values()).find((context) => context.id === id);
  }
  
  /**
   * Get all servers
   */
  async getAllServers(): Promise<Server[]> {
    return await ServerRepository.findAll();
  }

  /**
   * Get all available server IDs
   */
  getAvailableServers(): ServerContext[] {
    const availableServers = Array.from(this.serverContexts.values()).filter((context) => context && context.status === ServerStatus.Online);
    const temporaryServers = Array.from(this.temporaryServers.values()).filter((context) => context && context.status === ServerStatus.Online);
    return [...availableServers, ...temporaryServers];
  }

  getUserAvailableServers(user: User): ServerContext[] {
    const permissions = JSON.parse(user.permissions) as Permissions;
    const availableServers = this.getAvailableServers();
    const result: ServerContext[] = [];
    for (const server of availableServers) {
      if (server.serverEntity.allowUserInput) {
        if (server.userId === user.userId) {
          result.push(server);
        }
      } else {
        if (permissions[server.serverEntity.serverId]?.enabled ?? true) {
          result.push(server);
        }
      }
    }
    return result;
  }

  getAvailableServersCapabilities(): McpServerCapabilities {
    const capabilities: McpServerCapabilities = {};
    for (const context of this.getAvailableServers()) {
      const mcpCaps = context.getMcpCapabilities();
      if (context.serverEntity.allowUserInput) {
        mcpCaps.tools = {};
        mcpCaps.resources = {};
        mcpCaps.prompts = {};
        mcpCaps.configured = false;
      }
      capabilities[context.serverEntity.serverId] = mcpCaps;
    }
    return capabilities;
  }
  
  /**
   * Add new server connection
   */
  async addServer(serverEntity: Server, token: string): Promise<ServerContext> {
    if (this.serverContexts.has(serverEntity.serverId)) {
      this.logger.debug({ serverName: serverEntity.serverName }, 'Server already exists');

      const serverContext = this.serverContexts.get(serverEntity.serverId)!;

      if (serverContext.serverEntity.launchConfig !== serverEntity.launchConfig) {
        await this.removeServer(serverEntity.serverId);
      }else if (serverContext.status === ServerStatus.Online) {
        return serverContext;
      } else if (serverContext.status === ServerStatus.Connecting) {
        return serverContext;
      } else {
        await this.removeServer(serverEntity.serverId);
      }
    }
    
    const serverContext = new ServerContext(serverEntity);
    this.serverContexts.set(serverEntity.serverId, serverContext);

    // Create ServerLogger for this server
    const serverLogger = new ServerLogger(serverEntity.serverId);
    this.serverLoggers.set(serverEntity.serverId, serverLogger);

    await this.createServerConnection(serverContext, token);
    return serverContext;
  }
  
  /**
   * Remove server connection
   */
  async removeServer(serverID: string): Promise<ServerContext | undefined> {
    const serverContext = this.serverContexts.get(serverID);
    if (serverContext) {
      // Log ServerClose event (1311) before cleanup
      const serverLogger = this.serverLoggers.get(serverID);
      if (serverLogger) {
        await serverLogger.logServerLifecycle({
          action: MCPEventLogType.ServerClose,
        });
      }

      // Stop token refresh timer
      serverContext.stopTokenRefresh();

      try {
        if (serverContext.connection) {
          if (serverContext.transport instanceof StreamableHTTPClientTransport) {
            await serverContext.transport?.terminateSession();
          }
          await serverContext.connection.close();
          serverContext.status = ServerStatus.Offline;
        }
      } catch (error) {
        this.logger.error({ error, serverID }, 'Error closing server connection');
      }

      this.serverContexts.delete(serverID);
      this.serverLoggers.delete(serverID); // Clean up ServerLogger
      this.logger.info({ serverID }, 'Server context removed');
      return serverContext;
    } else {
      return undefined;
    }
  }
  
  /**
   * Disconnect and reconnect server (for API key change)
   */
  async reconnectServer(serverEntity: Server, token: string): Promise<ServerContext> {
    // First disconnect existing connection
    await this.removeServer(serverEntity.serverId);

    // Recreate connection with new API key
    const serverContext = new ServerContext(serverEntity);
    this.serverContexts.set(serverEntity.serverId, serverContext);

    await this.createServerConnection(serverContext, token);

    this.logger.info({ serverName: serverEntity.serverName }, 'Server reconnected with new API key');
    return serverContext;
  }
  
  /**
   * Update server configuration
   */
  async updateServerCapabilitiesConfig(serverId: string, capabilities: string): Promise<{ toolsChanged: boolean, resourcesChanged: boolean, promptsChanged: boolean }> {
    const currentContext = this.serverContexts.get(serverId);
    
    if (!currentContext) {
      return { toolsChanged: false, resourcesChanged: false, promptsChanged: false };
    }

    // Get current server configuration for comparison
    const currentServerEntity = currentContext.serverEntity;
    if (currentServerEntity.capabilities === capabilities) {
      return { toolsChanged: false, resourcesChanged: false, promptsChanged: false };
    }

    try {
      const newCapabilitiesConfig = JSON.parse(capabilities) as ServerConfigCapabilities;
      if (!newCapabilitiesConfig.tools) {
        newCapabilitiesConfig.tools = {};
      }
      if (!newCapabilitiesConfig.resources) {
        newCapabilitiesConfig.resources = {};
      }
      if (!newCapabilitiesConfig.prompts) {
        newCapabilitiesConfig.prompts = {};
      }
      const oldCapabilitiesConfig = currentContext.capabilitiesConfig;
      if (!oldCapabilitiesConfig.tools) {
        oldCapabilitiesConfig.tools = {};
      }
      if (!oldCapabilitiesConfig.resources) {
        oldCapabilitiesConfig.resources = {};
      }
      if (!oldCapabilitiesConfig.prompts) {
        oldCapabilitiesConfig.prompts = {};
      }

      const { toolsChanged, resourcesChanged, promptsChanged } = currentContext.isCapabilityChanged(newCapabilitiesConfig);
      currentContext.lastSync = new Date();
      currentContext.updateCapabilitiesConfig(capabilities);
      return { toolsChanged, resourcesChanged, promptsChanged };
    } catch (error) {
      this.logger.error({ error, serverId }, 'Failed to update server configuration');
      return { toolsChanged: true, resourcesChanged: true, promptsChanged: true };
    }
  }
  
  /**
   * Create server connection
   */
  private async createServerConnection(
    serverContext: ServerContext, 
    token: string
  ): Promise<void> {
    
    if (serverContext.status === ServerStatus.Online) {
      return;
    } else if (serverContext.status === ServerStatus.Connecting) {
      return;
    }

    const serverEntity: Server = serverContext.serverEntity;

    try {
      serverContext.status = ServerStatus.Connecting;
      serverContext.userToken = token;
      
      // 1. Parse launch_config
      const baseLaunchConfig = await this.decryptLaunchConfig(token, serverEntity);

      const launchConfig = JSON.parse(baseLaunchConfig);

      // 2. Initialize authentication (handle OAuth token)
      await this.initializeAuthentication(serverContext, launchConfig, token);

      if (serverEntity.category === ServerCategory.RestApi) {
        if (!serverEntity.configTemplate || serverEntity.configTemplate.trim() === '' || serverEntity.configTemplate.trim() === '{}') {
          throw new Error(`[ServerManager] Missing configTemplate for server ${serverEntity.serverId}`);
        }
        const config = JSON.parse(serverEntity.configTemplate);
        config.apis[0].auth = launchConfig.auth;
        delete launchConfig.auth;
        launchConfig.env ??= {
          type: "none"
        };
        launchConfig.env.GATEWAY_CONFIG = JSON.stringify(config);
      }

      // 4. Create transport using dynamic transport factory
      const transport = await DownstreamTransportFactory.create(launchConfig);

      transport.onclose = () => {
        this.logger.warn({ serverName: serverEntity.serverName }, 'Transport closed');
        const affectedSessions = this.sessionStore?.getSessionsUsingServer(serverEntity.serverId) ?? [];
        
        serverContext.status = ServerStatus.Error;
        serverContext.lastError = `Transport closed by server`;
        serverContext.errorCount++;

        this.removeServer(serverEntity.serverId);

        this.notifyUsersOfServerChange(serverEntity.serverId, affectedSessions, 'server_error', {
          toolsChanged: (serverContext.tools?.tools?.length ?? 0) > 0,
          resourcesChanged: (serverContext.resources?.resources?.length ?? 0) > 0,
          promptsChanged: (serverContext.prompts?.prompts?.length ?? 0) > 0
        });
      };
      
      // 5. Create MCP client
      const client = new Client(
        {
          name: APP_INFO.name,
          version: APP_INFO.version
        },
        this.clientOptions
      );
      
      // 6. Establish connection
      await client.connect(transport);
      this.logger.info({ serverName: serverEntity.serverName }, 'Connection established');

      // 7. Register global reverse request handlers
      this.registerReverseRequestHandlers(client, serverEntity.serverId);

      await client.ping({ timeout: 5000 });

      serverContext.status = ServerStatus.Online;
      
      // 7. Save connection to context
      serverContext.connection = client;
      serverContext.transport = transport;

      // 8. Get server capabilities
      await this.updateServerCapabilities(serverContext);
      this.logger.info({ serverName: serverEntity.serverName }, 'Server connection established');

      // 9. Log ServerInit event (1310)
      const serverLogger = this.serverLoggers.get(serverEntity.serverId);
      if (serverLogger) {
        await serverLogger.logServerLifecycle({
          action: MCPEventLogType.ServerInit,
        });
      }
    } catch (error) {
      this.logger.warn({ error, serverName: serverEntity.serverName }, 'Failed to get capabilities');
      serverContext.status = ServerStatus.Error;
      serverContext.lastError = error instanceof Error ? error.message : `${error}`;
      serverContext.errorCount++;

      throw error;
    }
  }

  async updateServerCapabilities(serverContext: ServerContext): Promise<void> {
    
    if (!serverContext.connection) {
      return;
    }

    const client = serverContext.connection;

    try {

      const capabilities = client.getServerCapabilities();

      if (capabilities) {
        serverContext.updateCapabilities(capabilities);

        const serverCapabilities = serverContext.capabilitiesConfig;
        const toolsEmpty = Object.keys(serverCapabilities.tools ?? {}).length === 0;
        const resourcesEmpty = Object.keys(serverCapabilities.resources ?? {}).length === 0;
        const promptsEmpty = Object.keys(serverCapabilities.prompts ?? {}).length === 0;

        if (capabilities.tools?.listChanged === true) {
          client.setNotificationHandler(
            ToolListChangedNotificationSchema,
            async (notification: ToolListChangedNotification) => {
              const tools = await client.listTools();
              serverContext.updateTools(tools);
              this.globalRouter?.handleToolsListChanged(serverContext.serverEntity.serverId);

              // Log ServerCapabilityUpdate (1313)
              const serverLogger = this.serverLoggers.get(serverContext.serverEntity.serverId);
              if (serverLogger) {
                await serverLogger.logServerCapabilityUpdate({
                  requestParams: { type: 'tools/listChanged', toolsCount: tools.tools?.length || 0 }
                });
              }
            }
          );
        }

        if (capabilities.resources?.listChanged === true) {
          client.setNotificationHandler(
            ResourceListChangedNotificationSchema,
            async (notification: ResourceListChangedNotification) => {
              const resources = await client.listResources();
              serverContext.updateResources(resources);
              const resourceTemplates = await client.listResourceTemplates();
              serverContext.updateResourceTemplates(resourceTemplates);
              this.globalRouter?.handleResourcesListChanged(serverContext.serverEntity.serverId);

              // Log ServerCapabilityUpdate (1313)
              const serverLogger = this.serverLoggers.get(serverContext.serverEntity.serverId);
              if (serverLogger) {
                await serverLogger.logServerCapabilityUpdate({
                  requestParams: { type: 'resources/listChanged', resourcesCount: resources.resources?.length || 0 }
                });
              }
            }
          );
        }

        if (capabilities.resources?.subscribe === true) {
          client.setNotificationHandler(
            ResourceUpdatedNotificationSchema,
            async (notification: ResourceUpdatedNotification) => {
              this.globalRouter?.handleResourceUpdated(serverContext.serverEntity.serverId, notification);
            }
          );
        }

        if (capabilities.prompts?.listChanged === true) {
          client.setNotificationHandler(
            PromptListChangedNotificationSchema,
            async (notification: PromptListChangedNotification) => {
              const prompts = await client.listPrompts();
              serverContext.updatePrompts(prompts);
              this.globalRouter?.handlePromptsListChanged(serverContext.serverEntity.serverId);

              // Log ServerCapabilityUpdate (1313)
              const serverLogger = this.serverLoggers.get(serverContext.serverEntity.serverId);
              if (serverLogger) {
                await serverLogger.logServerCapabilityUpdate({
                  requestParams: { type: 'prompts/listChanged', promptsCount: prompts.prompts?.length || 0 }
                });
              }
            }
          );
        }

        try {
          const tools = await client.listTools();
          if (tools) {
            serverContext.updateTools(tools);
          }
        } catch (error) {
          this.logger.warn({ error, serverName: serverContext.serverEntity.serverName }, 'Failed to get tools');
        }

        try {
          if (capabilities.resources) {
            const resources = await client.listResources();
            serverContext.updateResources(resources);
            
            const resourceTemplates = await client.listResourceTemplates();
            serverContext.updateResourceTemplates(resourceTemplates);
          }
        } catch (error) {
          this.logger.warn({ error, serverName: serverContext.serverEntity.serverName }, 'Failed to get resources');
        }

        try {
          if (capabilities.prompts) {
            const prompts = await client.listPrompts();
            if (prompts) {
              serverContext.updatePrompts(prompts);
            }
          }
        } catch (error) {
          this.logger.warn({ error, serverName: serverContext.serverEntity.serverName }, 'Failed to get prompts');
        }

        if (toolsEmpty && resourcesEmpty && promptsEmpty) {
          try {
            const configTemplateValue = serverContext.serverEntity.configTemplate!;
            const template = JSON.parse(configTemplateValue);
            const config = template?.toolDefaultConfig;
            if (config !== undefined) {
              const defaultConfig = typeof config === 'string' ? JSON.parse(config) : config;
              serverContext.updateCapabilitiesConfig(JSON.stringify({tools: defaultConfig, resources: {}, prompts: {}}));
            }
          } catch (error) {
            this.logger.error({ error }, 'Invalid configTemplate JSON');
          }

          const newCapabilities = serverContext.getMcpCapabilities();

          if (serverContext.serverEntity.allowUserInput) {
            if (serverContext.userId) {
              const user = await UserRepository.findById(serverContext.userId);
              if (user) {
                const userPreferences = JSON.parse(user.userPreferences || '{}');
                userPreferences[serverContext.serverID] = newCapabilities;
                await UserRepository.updateUserPreferences(serverContext.userId, userPreferences);
              }
            }
          } else {
            await ServerRepository.updateCapabilities(serverContext.serverID, JSON.stringify({tools: newCapabilities.tools, resources: newCapabilities.resources, prompts: newCapabilities.prompts}));
          }
        }
      }
    } catch (error) {
      this.logger.warn({ error, serverName: serverContext.serverEntity.serverName }, 'Failed to get capabilities');
    }
  }

  /**
   * Initialize authentication (handle different authentication methods based on authType)
   */
  private async initializeAuthentication(
    serverContext: ServerContext,
    launchConfig: any,
    token: string
  ): Promise<void> {
    switch (serverContext.serverEntity.authType) {
      case ServerAuthType.GoogleAuth:
        await this.initializeGoogleAuth(serverContext, launchConfig);
        break;

      case ServerAuthType.NotionAuth:
        serverContext.userToken = token;
        await this.initializeNotionAuth(serverContext, launchConfig);
        break;

      case ServerAuthType.ApiKey:
        // API Key doesn't need special handling, just pass through
        break;

      // Reserved extension point: can add other OAuth providers in the future
      // case ServerAuthType.GitHubAuth:
      //   await this.initializeGitHubAuth(serverContext, launchConfig);
      //   break;

      // case ServerAuthType.MicrosoftAuth:
      //   await this.initializeMicrosoftAuth(serverContext, launchConfig);
      //   break;

      default:
        this.logger.warn(
          { authType: serverContext.serverEntity.authType, serverName: serverContext.serverEntity.serverName },
          'Unknown auth type'
        );
    }
  }

  /**
   * Initialize Google OAuth authentication
   */
  private async initializeGoogleAuth(
    serverContext: ServerContext,
    launchConfig: any
  ): Promise<void> {
    // 1. Verify OAuth configuration exists
    if (
      !launchConfig.oauth?.clientId ||
      !launchConfig.oauth?.clientSecret ||
      !launchConfig.oauth?.refreshToken
    ) {
      throw new Error(
        `[ServerManager] Missing OAuth configuration for server ${serverContext.serverID}. Required: clientId, clientSecret, refreshToken`
      );
    }

    // 2. Create authentication strategy
    const authStrategy = AuthStrategyFactory.create(
      ServerAuthType.GoogleAuth,
      launchConfig.oauth
    );

    if (!authStrategy) {
      throw new Error(
        `[ServerManager] Failed to create auth strategy for server ${serverContext.serverID}`
      );
    }

    // 3. Start token refresh and get initial token
    const initialToken = await serverContext.startTokenRefresh(authStrategy);

    // 4. Inject access token into environment variables (don't pass OAuth config)
    launchConfig.env = {
      ...launchConfig.env,
      accessToken: initialToken,
    };

    // 5. Remove oauth config (don't pass to downstream server)
    delete launchConfig.oauth;

    this.logger.info({ serverName: serverContext.serverEntity.serverName }, 'Google OAuth initialized');
  }

  /**
   * Initialize Notion OAuth authentication
   */
  private async initializeNotionAuth(
    serverContext: ServerContext,
    launchConfig: any
  ): Promise<void> {
    // 1. Verify OAuth configuration exists
    if (
      !launchConfig.oauth?.clientId ||
      !launchConfig.oauth?.clientSecret ||
      !launchConfig.oauth?.refreshToken
    ) {
      throw new Error(
        `[ServerManager] Missing OAuth configuration for server ${serverContext.serverID}. Required: clientId, clientSecret, refreshToken`
      );
    }

    // 2. Create authentication strategy
    const authStrategy = AuthStrategyFactory.create(
      ServerAuthType.NotionAuth,
      launchConfig.oauth
    );

    if (!authStrategy) {
      throw new Error(
        `[ServerManager] Failed to create auth strategy for server ${serverContext.serverID}`
      );
    }

    // 3. Start token refresh and get initial token
    const initialToken = await serverContext.startTokenRefresh(authStrategy);

    // 4. Inject access token into environment variables (don't pass OAuth config)
    launchConfig.env = {
      ...launchConfig.env,
      accessToken: initialToken,
    };

    // 5. Remove oauth config (don't pass to downstream server)
    delete launchConfig.oauth;

    this.logger.info({ serverName: serverContext.serverEntity.serverName }, 'Notion OAuth initialized');
  }

  /**
   * Update OAuth configuration for regular server
   *
   * Used to update OAuth configuration stored in server.launchConfig
   * Supports complete OAuth configuration updates (accessToken, refreshToken, expiresAt, etc.)
   * Only for regular Server, temporary Server uses updateUserLaunchConfig()
   *
   * @param serverContext Regular server context (must have userToken)
   * @param oauthConfig OAuth configuration object (can include accessToken, refreshToken, expiresAt, etc.)
   */
  async updateServerLaunchConfig(
    serverContext: ServerContext,
    oauthConfig: any
  ): Promise<void> {
    try {
      const serverId = serverContext.serverID;
      const serverEntity = serverContext.serverEntity;
      const userToken = serverContext.userToken;

      // 1. Check if userToken exists
      if (!userToken) {
        this.logger.warn(
          { serverId, serverName: serverEntity.serverName },
          'No userToken available for OAuth config update'
        );
        return;
      }

      // 2. Decrypt launchConfig
      const decryptedLaunchConfig = await CryptoService.decryptDataFromString(
        serverEntity.launchConfig,
        userToken
      );
      const launchConfig = JSON.parse(decryptedLaunchConfig);

      // 3. Check if oauth config exists
      if (!launchConfig.oauth) {
        launchConfig.oauth = {};
      }

      // 4. Update complete oauth config
      // Use spread operator to merge update (compatible with different types of OAuth config)
      launchConfig.oauth = {
        ...launchConfig.oauth,
        ...oauthConfig,
      };

      this.logger.debug({
        serverId,
        serverName: serverEntity.serverName,
        hasAccessToken: !!oauthConfig.accessToken,
        hasRefreshToken: !!oauthConfig.refreshToken,
        hasExpiresAt: !!oauthConfig.expiresAt,
        expiresAt: oauthConfig.expiresAt
          ? new Date(oauthConfig.expiresAt).toISOString()
          : 'N/A'
      }, 'Updating OAuth config in server launchConfig');

      // 5. Re-encrypt launchConfig
      const updatedLaunchConfigStr = JSON.stringify(launchConfig);
      const encryptedLaunchConfigData = await CryptoService.encryptData(
        updatedLaunchConfigStr,
        userToken
      );

      // 6. Serialize encrypted data to string
      const encryptedLaunchConfig = JSON.stringify(encryptedLaunchConfigData);

      // 7. Save to database
      const updatedServer = await ServerRepository.updateLaunchConfig(
        serverId,
        encryptedLaunchConfig
      );

      // 8. Update serverEntity in memory
      serverContext.serverEntity = updatedServer;

      this.logger.info({
        serverId,
        serverName: serverEntity.serverName,
        updatedFields: Object.keys(oauthConfig).join(', ')
      }, 'Server OAuth config updated successfully');
    } catch (error) {
      this.logger.error(
        { error, serverId: serverContext.serverID },
        'Failed to update server OAuth config'
      );
      // Don't throw error to avoid interrupting token refresh flow
    }
  }

  /**
   * Update user's launchConfig (for temporary Server OAuth configuration updates)
   *
   * This method is used to update individual user's Server configuration, including accessToken, refreshToken, expiresAt
   * Temporary Server configuration is stored in user.launchConfigs, requiring complete flow of decrypt, update, encrypt, save
   *
   * @param serverContext Temporary Server context (must have userId and userToken)
   * @param oauthConfig New OAuth configuration (includes accessToken, refreshToken, expiresAt)
   */
  async updateUserLaunchConfig(
    serverContext: ServerContext,
    oauthConfig: any
  ): Promise<void> {
    try {
      const userId = serverContext.userId;
      const serverId = serverContext.serverID;
      const userToken = serverContext.userToken;

      // 1. Validate parameters
      if (!userId || !userToken) {
        this.logger.warn(
          { serverId, userId },
          'Missing userId or userToken for user launch config update'
        );
        return;
      }

      // 2. Read user from database
      const user = await UserRepository.findById(userId);
      if (!user) {
        this.logger.warn({ userId }, 'User not found for launch config update');
        return;
      }

      // 3. Parse launchConfigs
      const launchConfigs = JSON.parse(user.launchConfigs || '{}');

      // 4. Decrypt this server's launchConfig
      const encryptedConfig = launchConfigs[serverId];
      if (!encryptedConfig) {
        this.logger.warn(
          { serverId, userId },
          'Server config not found in user launchConfigs'
        );
        return;
      }

      const decryptedStr = await CryptoService.decryptDataFromString(
        JSON.stringify(encryptedConfig),
        userToken
      );
      const launchConfig = JSON.parse(decryptedStr);

      // 5. Update oauth configuration
      if (!launchConfig.oauth) {
        launchConfig.oauth = {};
      }

      launchConfig.oauth = {
        ...launchConfig.oauth,
        ...oauthConfig,
      };

      this.logger.debug(
        {
          serverId,
          userId,
          hasAccessToken: !!oauthConfig.accessToken,
          expiresAt: oauthConfig.expiresAt
            ? new Date(oauthConfig.expiresAt).toISOString()
            : 'N/A',
        },
        'Updating OAuth config in launchConfig'
      );

      // 6. Re-encrypt
      const encryptedData = await CryptoService.encryptData(
        JSON.stringify(launchConfig),
        userToken
      );

      // 7. Update launchConfigs
      launchConfigs[serverId] = encryptedData;

      // 8. Save to database
      await UserRepository.updateLaunchConfigs(userId, launchConfigs);

      // 9. Synchronously update all sessions for this user (refer to ConfigureServerHandler.ts:94-98)
      const launchConfigsStr = JSON.stringify(launchConfigs);
      if (this.sessionStore) {
        const userSessions = this.sessionStore.getUserSessions(userId);
        for (const session of userSessions) {
          session.launchConfigs = launchConfigsStr;
        }

        this.logger.debug(
          { serverId, userId, sessionCount: userSessions.length },
          'Synced launchConfigs to user sessions'
        );
      }

      this.logger.info(
        { serverId, userId },
        'User launch config updated with new OAuth tokens'
      );
    } catch (error) {
      this.logger.error(
        {
          error,
          serverId: serverContext.serverID,
          userId: serverContext.userId,
        },
        'Failed to update user launch config'
      );
      // Don't throw error to avoid interrupting token refresh flow
    }
  }

  async decryptLaunchConfig(token: string, serverEntity: Server) : Promise<string> {
    const serverName = serverEntity.serverName;
    try {
      // Decrypt launch config
      const launchConfig = await CryptoService.decryptDataFromString(
        serverEntity.launchConfig, // encrypted launch config
        token // rawBase64 key
      );

      return launchConfig;
    } catch (error) {
      throw new AuthError(
        AuthErrorType.INVALID_TOKEN,
        `Failed to decrypt launch config for server ${serverName}`,
        'owner',
        error
      );
    }
  }

  async connectAllServers(token: string) : Promise<{ successServers: { serverId: string; serverName: string; proxyId: number }[]; failedServers: { serverId: string; serverName: string; proxyId: number }[] }> {

    // Create connections for all serverContexts concurrently
    const connectPromises: Promise<Server>[] = [];

    const enabledServers = await ServerRepository.findEnabled();
    const contexts: ServerContext[] = [];
    for (const server of enabledServers) {
      if (server.allowUserInput) {
        continue;
      }
      try {
        const context = this.serverContexts.get(server.serverId);
        if (context?.status === ServerStatus.Online || context?.status === ServerStatus.Connecting) {
          continue;
        }
        this.serverContexts.delete(server.serverId);
        const serverContext = new ServerContext(server);
        this.serverContexts.set(server.serverId, serverContext);
        contexts.push(serverContext);
        this.logger.info({ serverName: server.serverName }, 'Server context initialized');
      } catch (error) {
        this.logger.error({ error, serverName: server.serverName }, 'Failed to initialize server');
      }
    }

    for (const serverContext of contexts) {
      connectPromises.push(this.createServerConnection(serverContext, token).then(() => serverContext.serverEntity).catch((error) => serverContext.serverEntity));
    }
    const results = await Promise.allSettled(connectPromises);
    // Return list of successful and failed servers
    const successServers = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
    const failedServers = results.filter((result) => result.status === 'rejected').map((result) => result.reason);
    return {
      successServers: successServers.map((server) => ({
        serverId: server.serverId,
        serverName: server.serverName,
        proxyId: server.proxyId
      })),
      failedServers: failedServers.map((server) => ({
        serverId: server.serverId,
        serverName: server.serverName,
        proxyId: server.proxyId
      }))
    };
  }
  
  /**
   * Register reverse request handlers
   * Handle requests initiated by Server (Sampling, Roots, Elicitation)
   */
  private registerReverseRequestHandlers(client: Client, serverId: string): void {
    if (!this.globalRouter) {
      this.logger.warn('GlobalRequestRouter not initialized, skipping reverse request handler registration');
      return;
    }

    const router = this.globalRouter;

    if (this.clientOptions.capabilities?.sampling) {
      // Register Sampling request handler
      client.setRequestHandler(
        CreateMessageRequestSchema,
        async (request, extra) => {
          this.logger.debug({
            serverId,
            requestId: extra?.requestId,
            sessionId: extra?.sessionId,
            requestInfo: extra?.requestInfo,
            hasAuthInfo: !!extra?.authInfo,
            hasSendRequest: typeof extra?.sendRequest === 'function',
            hasSendNotification: typeof extra?.sendNotification === 'function'
          }, 'Server requested sampling');

          // Extract proxyContext from _meta
          const proxyContext = request.params._meta?.proxyContext as ProxyContext | undefined;

          if (!proxyContext || !proxyContext.proxyRequestId) {
            this.logger.error({
              serverId,
              requestId: extra?.requestId,
              params: request.params
            }, '[CRITICAL] No proxyContext in sampling request');
            throw new McpError(
              ErrorCode.InvalidRequest,
              'Missing proxyContext for sampling request routing'
            );
          }

          return router.handleSamplingRequest(serverId, request, proxyContext);
        }
      );
    }

    if (this.clientOptions.capabilities?.roots) {
      // Register Roots list request handler
      client.setRequestHandler(
        ListRootsRequestSchema,
        async (request, extra) => {
          this.logger.debug({
            serverId,
            requestId: extra?.requestId,
            sessionId: extra?.sessionId,
            requestInfo: extra?.requestInfo
          }, 'Server requested roots list');

          // Extract proxyContext from _meta
          const proxyContext = request.params?._meta?.proxyContext as ProxyContext | undefined;

          if (!proxyContext || !proxyContext.proxyRequestId) {
            this.logger.error({
              serverId,
              requestId: extra?.requestId,
              params: request.params
            }, '[CRITICAL] No proxyContext in roots list request');
            throw new McpError(
              ErrorCode.InvalidRequest,
              'Missing proxyContext for roots list request routing'
            );
          }

          return router.handleRootsListRequest(serverId, request, proxyContext);
        }
      );
    }

    if (this.clientOptions.capabilities?.elicitation) {
      // Register Elicitation request handler
      client.setRequestHandler(
        ElicitRequestSchema,
        async (request, extra) => {
          this.logger.debug({
            serverId,
            requestId: extra?.requestId,
            sessionId: extra?.sessionId,
            requestInfo: extra?.requestInfo,
            params: request.params
          }, 'Server requested user input');
  
          // Extract proxyContext from _meta
          const proxyContext = request.params._meta?.proxyContext as ProxyContext | undefined;
  
          if (!proxyContext || !proxyContext.proxyRequestId) {
            this.logger.error({
              serverId,
              requestId: extra?.requestId,
              params: request.params
            }, '[CRITICAL] No proxyContext in elicitation request');
            throw new McpError(
              ErrorCode.InvalidRequest,
              'Missing proxyContext for elicitation request routing'
            );
          }
  
          return router.handleElicitationRequest(serverId, request, proxyContext);
        }
      );
    }

    this.logger.info({ serverId }, 'Reverse request handlers registered');
    
    // Register cancellation notification handler from server
    client.setNotificationHandler(
      CancelledNotificationSchema,
      async (notification: CancelledNotification) => {
        this.logger.debug({ serverId, requestId: notification.params.requestId }, 'Server sent cancellation');

        // Extract sessionId from proxyRequestId (format: "sessionId:originalId:timestamp")
        const proxyRequestId = String(notification.params.requestId);
        const sessionId = proxyRequestId.split(':')[0];

        if (!sessionId) {
          this.logger.error({ proxyRequestId }, 'Failed to extract sessionId from proxyRequestId');
          return;
        }

        // Get ProxySession through SessionStore
        const proxySession = this.sessionStore!.getProxySession(sessionId);
        if (proxySession) {
          try {
            // Forward cancellation notification to client
            await proxySession.forwardCancellationToClient(notification);
          } catch (error) {
            this.logger.error({ error, serverId, sessionId }, 'Failed to forward cancellation from server');
          }
        } else {
          this.logger.warn({ sessionId }, 'No ProxySession found for sessionId');
        }
      }
    );
    
    // Register progress notification handler from server
    client.setNotificationHandler(
      ProgressNotificationSchema,
      async (notification: ProgressNotification) => {
        this.logger.debug({ serverId }, 'Server sent progress notification');

        // progressToken is actually proxyRequestId (format: "sessionId:originalId:timestamp")
        const proxyRequestId = String(notification.params.progressToken);
        const sessionId = proxyRequestId.split(':')[0];

        if (!sessionId) {
          this.logger.error({ proxyRequestId }, 'Failed to extract sessionId from progressToken');
          return;
        }

        // Get ProxySession through SessionStore
        const proxySession = this.sessionStore!.getProxySession(sessionId);
        if (proxySession) {
          try {
            // Forward progress notification to client
            await proxySession.forwardProgressToClient(notification);
          } catch (error) {
            this.logger.error({ error, serverId, sessionId }, 'Failed to forward progress from server');
          }
        } else {
          this.logger.warn({ sessionId }, 'No ProxySession found for sessionId');
        }
      }
    );

    client.setNotificationHandler(
      ResourceUpdatedNotificationSchema,
      async (notification: ResourceUpdatedNotification) => {
        this.logger.debug({ serverId }, 'Server sent resource updated notification');

        router.handleResourceUpdated(serverId, notification);
      }
    );
  }

  async notifyUsersOfServerChange(serverId: string, affectedSessions: ClientSession[], changeType: string, changed: { toolsChanged: boolean, resourcesChanged: boolean, promptsChanged: boolean }): Promise<void> {
    try {
      this.logger.info({ serverId, changeType, changed }, 'Notifying users of server change');
      
      socketNotifier.notifyUserPermissionChangedByServer(serverId);
      
      if (affectedSessions.length === 0) {
        this.logger.debug({ serverId }, 'No affected sessions for server');
        return;
      }

      if (!changed.toolsChanged && !changed.resourcesChanged && !changed.promptsChanged) {
        return;
      }

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
        }
        catch (error) {
          this.logger.error({ error, sessionId: session.sessionId }, 'Failed to notify session');
        }
      }

      this.logger.info({ serverId, changeType, sessionCount: affectedSessions.length }, 'Notified sessions about server change');
    } catch (error) {
      this.logger.error({ error, serverId, changeType, changed }, 'Failed to notify users of server change');
    }
  }

  /**
   * Health check all servers
   */
  async healthCheck(): Promise<{ [serverID: string]: ServerStatus }> {
    const results: { [serverID: string]: ServerStatus } = {};
    
    for (const [serverID, context] of this.serverContexts.entries()) {
      if (context.status === ServerStatus.Online) {
        results[serverID] = ServerStatus.Online;
        continue;
      } else if (context.status === ServerStatus.Connecting) {
        results[serverID] = ServerStatus.Connecting;
        continue;
      } else if (context.status === ServerStatus.Offline) {
        results[serverID] = ServerStatus.Offline;
        continue;
      } else if (context.status === ServerStatus.Error) {
        results[serverID] = ServerStatus.Error;
        continue;
      }
    }
    
    return results;
  }
  
  /**
   * Aggregate resource subscription (reference counting)
   *
   * @param serverId Server ID
   * @param resourceUri Original resource URI (without prefix)
   * @param sessionId Session ID
   */
  async subscribeResource(serverId: string, resourceUri: string, sessionId: string, userId: string): Promise<void> {
    const subscriptionKey = `${serverId}::${resourceUri}`;
    this.logger.debug({ subscriptionKey, sessionId }, 'Subscribe request');

    const serverContext = this.getServerContext(serverId, userId);
    if (serverContext?.capabilities?.resources?.subscribe !== true) {
      this.logger.debug({ serverId }, 'Server does not support resource subscription');
      return;
    }

    // Get or create subscription state
    let state = this.resourceSubscriptions.get(subscriptionKey);
    if (!state) {
      state = {
        subscribedSessions: new Set(),
        downstreamSubscribed: false
      };
      this.resourceSubscriptions.set(subscriptionKey, state);
    }

    // If already subscribed, return directly
    if (state.subscribedSessions.has(sessionId)) {
      this.logger.debug({ sessionId, subscriptionKey }, 'Session already subscribed');
      return;
    }

    // Add session to subscription list
    state.subscribedSessions.add(sessionId);

    // If this is the first subscription, send subscription request to downstream
    if (!state.downstreamSubscribed) {
      if (!serverContext || !serverContext.connection) {
        throw new Error(`Server ${serverId} not available for subscription`);
      }

      try {
        // Send subscription request to downstream
        await serverContext.connection.subscribeResource(
          {
            uri: resourceUri
          }
        );

        state.downstreamSubscribed = true;
        this.logger.info({ subscriptionKey }, 'Subscribed to downstream resource');
      } catch (error) {
        // Subscription failed, remove session record
        state.subscribedSessions.delete(sessionId);
        if (state.subscribedSessions.size === 0) {
          this.resourceSubscriptions.delete(subscriptionKey);
        }
        throw error;
      }
    }

    this.logger.info({ subscriptionKey, subscriberCount: state.subscribedSessions.size }, 'Subscription successful');
  }

  /**
   * Aggregate resource unsubscription (reference counting)
   *
   * @param serverId Server ID
   * @param resourceUri Original resource URI (without prefix)
   * @param sessionId Session ID
   */
  async unsubscribeResource(serverId: string, resourceUri: string, sessionId: string, userId: string): Promise<void> {
    const subscriptionKey = `${serverId}::${resourceUri}`;
    this.logger.debug({ subscriptionKey, sessionId }, 'Unsubscribe request');

    const state = this.resourceSubscriptions.get(subscriptionKey);
    if (!state) {
      this.logger.debug({ subscriptionKey }, 'No subscription found');
      return;
    }

    // Remove session
    state.subscribedSessions.delete(sessionId);

    // If no sessions are subscribed, unsubscribe from downstream
    if (state.subscribedSessions.size === 0 && state.downstreamSubscribed) {
      const serverContext = this.getServerContext(serverId, userId);
      if (serverContext && serverContext.connection) {
        try {
          // Send unsubscription request to downstream
          await serverContext.connection.unsubscribeResource(
            {
              uri: resourceUri
            }
          );

          this.logger.info({ subscriptionKey }, 'Unsubscribed from downstream resource');
        } catch (error) {
          this.logger.error({ error, subscriptionKey }, 'Failed to unsubscribe from downstream resource');
        }
      }

      // Clean up subscription state
      this.resourceSubscriptions.delete(subscriptionKey);
    }

    this.logger.info({ subscriptionKey, remainingSubscribers: state.subscribedSessions.size }, 'Unsubscription successful');
  }

  /**
   * Get resource subscriber set
   *
   * @param subscriptionKey Subscription key `${serverId}::${resourceUri}`
   * @returns Set of subscribed session IDs
   */
  getResourceSubscribers(subscriptionKey: string): Set<string> {
    const state = this.resourceSubscriptions.get(subscriptionKey);
    return state ? state.subscribedSessions : new Set();
  }

  /**
   * Clean up all subscriptions for a session
   *
   * @param sessionId Session ID
   */
  async cleanupSessionSubscriptions(sessionId: string, userId: string): Promise<void> {
    this.logger.debug({ sessionId }, 'Cleaning up subscriptions for session');

    const unsubscribePromises: Promise<void>[] = [];

    for (const [subscriptionKey, state] of this.resourceSubscriptions.entries()) {
      if (state.subscribedSessions.has(sessionId)) {
        // Parse subscriptionKey
        const [serverId, resourceUri] = subscriptionKey.split('::', 2);
        unsubscribePromises.push(
          this.unsubscribeResource(serverId, resourceUri, sessionId, userId)
        );
      }
    }

    await Promise.all(unsubscribePromises);
    this.logger.info({ sessionId, subscriptionCount: unsubscribePromises.length }, 'Cleaned up subscriptions for session');
  }

  /**
   * Close all server connections
   */
  async shutdown(): Promise<void> {
    const closePromises = Array.from(this.serverContexts.values()).map(async (context) => {
      try {
        context.stopTokenRefresh();
        if (context.connection) {
          await context.connection.close();
        }
      } catch (error) {
        this.logger.error({ error, serverName: context.serverEntity.serverName }, 'Error closing server connection');
      }
    });

    await Promise.all(closePromises);
    this.serverContexts.clear();
    this.resourceSubscriptions.clear(); // Clean up subscription state
    this.logger.info('All server connections closed');
  }

  // ==================== Temporary Server Management Methods ====================

  /**
   * Create temporary server
   * @param serverId Original serverId
   * @param userId User ID
   * @param serverEntity Server entity (for creating ServerContext)
   * @param token User token (for decrypting launchConfig)
   * @returns ServerContext
   */
  async createTemporaryServer(
    serverId: string,
    userId: string,
    serverEntity: Server,
    token: string
  ): Promise<ServerContext> {
    const internalKey = `${serverId}:${userId}`;

    // Check if already exists
    if (this.temporaryServers.has(internalKey)) {
      const existingContext = this.temporaryServers.get(internalKey)!;
      if (existingContext.status === ServerStatus.Online) {
        return existingContext;
      }
      // If exists but not online, cleanup first
      await this.closeTemporaryServer(serverId, userId);
    }

    // Create ServerContext
    const serverContext = new ServerContext(serverEntity);
    serverContext.userId = userId;
    this.temporaryServers.set(internalKey, serverContext);

    // Create ServerLogger
    const serverLogger = new ServerLogger(internalKey);
    this.temporaryServerLoggers.set(internalKey, serverLogger);

    // Establish connection
    await this.createServerConnection(serverContext, token);

    this.logger.info({ internalKey }, 'Temporary server created');
    return serverContext;
  }

  /**
   * Get user's temporary server
   * @param serverId Original serverId
   * @param userId User ID
   * @returns ServerContext or undefined
   */
  getTemporaryServer(serverId: string, userId: string): ServerContext | undefined {
    const internalKey = `${serverId}:${userId}`;
    return this.temporaryServers.get(internalKey);
  }

  /**
   * Get temporary server
   * @param id Temporary serverId
   * @param userId User ID
   * @returns ServerContext or undefined
   */
  getTemporaryServerContextByID(id: string, userId: string): ServerContext | undefined {
    return Array.from(this.temporaryServers.values()).find((context) => context.id === id && context.userId === userId);
  }

  /**
   * Get all temporary servers for user
   * @param userId User ID
   * @returns Map<serverId, ServerContext>
   */
  getUserTemporaryServers(userId: string): Map<string, ServerContext> {
    const result = new Map<string, ServerContext>();
    for (const [key, connection] of this.temporaryServers) {
      if (key.endsWith(`:${userId}`)) {
        const serverId = key.substring(0, key.lastIndexOf(':'));
        result.set(serverId, connection);
      }
    }
    return result;
  }

  /**
   * Close user's specified temporary server
   * @param serverId Original serverId
   * @param userId User ID
   */
  async closeTemporaryServer(serverId: string, userId: string): Promise<void> {
    const internalKey = `${serverId}:${userId}`;
    const serverContext = this.temporaryServers.get(internalKey);

    if (serverContext) {
      // Log ServerClose event
      const serverLogger = this.temporaryServerLoggers.get(internalKey);
      if (serverLogger) {
        await serverLogger.logServerLifecycle({
          action: MCPEventLogType.ServerClose,
        });
      }

      // Stop token refresh timer
      serverContext.stopTokenRefresh();

      try {
        if (serverContext.connection) {
          if (serverContext.transport instanceof StreamableHTTPClientTransport) {
            await serverContext.transport?.terminateSession();
          }
          await serverContext.connection.close();
          serverContext.status = ServerStatus.Offline;
        }
      } catch (error) {
        this.logger.error({ error, internalKey }, 'Error closing temporary server connection');
      }

      this.temporaryServers.delete(internalKey);
      this.temporaryServerLoggers.delete(internalKey);
      this.logger.info({ internalKey }, 'Temporary server closed');
    }
  }

  /**
   * Close all temporary servers for user
   * @param userId User ID
   */
  async closeUserTemporaryServers(userId: string): Promise<void> {
    const keysToDelete: string[] = [];

    for (const key of this.temporaryServers.keys()) {
      if (key.endsWith(`:${userId}`)) {
        keysToDelete.push(key);
      }
    }

    await Promise.all(
      keysToDelete.map(async (key) => {
        const serverContext = this.temporaryServers.get(key);
        if (serverContext) {
          // Extract serverId from key
          const serverId = key.substring(0, key.lastIndexOf(':'));

          // Log ServerClose event
          const serverLogger = this.temporaryServerLoggers.get(key);
          if (serverLogger) {
            await serverLogger.logServerLifecycle({
              action: MCPEventLogType.ServerClose,
            });
          }

          // Stop token refresh timer
          serverContext.stopTokenRefresh();

          try {
            if (serverContext.connection) {
              if (serverContext.transport instanceof StreamableHTTPClientTransport) {
                await serverContext.transport?.terminateSession();
              }
              await serverContext.connection.close();
              serverContext.status = ServerStatus.Offline;
            }
          } catch (error) {
            this.logger.error({ error, key }, 'Error closing temporary server connection');
          }

          this.temporaryServers.delete(key);
          this.temporaryServerLoggers.delete(key);
        }
      })
    );

    this.logger.info({ userId }, 'All temporary servers closed for user');
  }

  /**
   * Close all temporary servers based on a template
   * @param serverId Template serverId
   */
  async closeAllTemporaryServersByTemplate(serverId: string): Promise<void> {
    const keysToDelete: string[] = [];
    const prefix = `${serverId}:`;

    for (const key of this.temporaryServers.keys()) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }

    await Promise.all(
      keysToDelete.map(async (key) => {
        const serverContext = this.temporaryServers.get(key);
        if (serverContext) {
          // Log ServerClose event
          const serverLogger = this.temporaryServerLoggers.get(key);
          if (serverLogger) {
            await serverLogger.logServerLifecycle({
              action: MCPEventLogType.ServerClose,
            });
          }

          // Stop token refresh timer
          serverContext.stopTokenRefresh();

          try {
            if (serverContext.connection) {
              if (serverContext.transport instanceof StreamableHTTPClientTransport) {
                await serverContext.transport?.terminateSession();
              }
              await serverContext.connection.close();
              serverContext.status = ServerStatus.Offline;
            }
          } catch (error) {
            this.logger.error({ error, key }, 'Error closing temporary server connection');
          }

          this.temporaryServers.delete(key);
          this.temporaryServerLoggers.delete(key);
        }
      })
    );

    this.logger.info({ serverId }, 'All temporary servers closed for template');
  }
}
import { SessionStore } from '../../mcp/core/SessionStore.js';
import { ServerManager } from '../../mcp/core/ServerManager.js';
import { UserRepository } from '../../repositories/UserRepository.js';
import { ServerRepository } from '../../repositories/ServerRepository.js';
import { AdminRequest, AdminError, AdminErrorCode } from '../../types/admin.types.js';
import { McpServerCapabilities, Permissions, ServerConfigCapabilities, ServerConfigWithEnabled } from '../../mcp/types/mcp.js';
import { ServerStatus } from '../../types/enums.js';
import { CapabilitiesService } from '../../mcp/services/CapabilitiesService.js';
import { createLogger } from '../../logger/index.js';

/**
 * Query operation handler (3000-3999)
 */
export class QueryHandler {
  // Logger for QueryHandler
  private logger = createLogger('QueryHandler');

  constructor(
    private sessionStore: SessionStore,
    private serverManager: ServerManager
  ) {}

  /**
   * Get all server capabilities configuration (3002)
   */
  async handleGetAvailableServersCapabilities(request: AdminRequest<any>): Promise<{ capabilities: McpServerCapabilities }> {
    const capabilities = this.serverManager.getAvailableServersCapabilities();
    const servers = await ServerRepository.findAll();
    for (const server of servers) {
      if (server.enabled === false) {
        continue;
      }
      if (capabilities[server.serverId]) {
        continue;
      }

      const serverCapabilities = server.allowUserInput ? {} : JSON.parse(server.capabilities ?? '{}');
      capabilities[server.serverId] = {
        enabled: server.enabled,
        serverName: server.serverName,
        allowUserInput: server.allowUserInput,
        authType: server.authType,
        configTemplate: server.configTemplate || '',
        configured: false,
        tools: serverCapabilities.tools ?? {},
        resources: serverCapabilities.resources ?? {},
        prompts: serverCapabilities.prompts ?? {}
      }; 
    }
    return {
      capabilities: capabilities
    };
  }

  /**
   * Get user available server capabilities configuration (3003)
   */
  async handleGetUserAvailableServersCapabilities(request: AdminRequest<any>): Promise<{ capabilities: McpServerCapabilities }> {
    const { targetId } = request.data;

    const capabilities = await CapabilitiesService.getInstance().getCapabilitiesFromDatabase(targetId);
    return {
      capabilities: capabilities
    };
  }

  /**
   * Get all server status (3004)
   */
  async handleGetServersStatus(request: AdminRequest<any>): Promise<{ serversStatus: { [serverID: string]: ServerStatus } }> {
    const results = await this.serverManager.healthCheck();
    return {
      serversStatus: results
    };
  }

  /**
   * Get specified server capabilities configuration (3005)
   */
  async handleGetServersCapabilities(request: AdminRequest<any>): Promise<{ capabilities: ServerConfigCapabilities }> {
    const { targetId } = request.data;

    const serverContext = this.serverManager.getServerContext(targetId);
    if (!serverContext) {
      const serverEntity = await ServerRepository.findByServerId(targetId);
      if (!serverEntity) {
        throw new AdminError(`Server ${targetId} not found`, AdminErrorCode.SERVER_NOT_FOUND);
      }
      const capabilities = JSON.parse(serverEntity.capabilities);
      return {
        capabilities: { tools: capabilities.tools ?? {}, resources: capabilities.resources ?? {}, prompts: capabilities.prompts ?? {} }
      }
    }

    const serverCapabilities = serverContext.getMcpCapabilities();
    this.logger.debug({
      serverId: serverContext.serverEntity.serverId,
      serverCapabilities
    }, 'Server capabilities retrieved');
    return {
      capabilities: serverCapabilities
    };
  }
}

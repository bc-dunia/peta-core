/**
 * SetCapabilitiesHandler - Socket user custom capability configuration handler
 *
 * Handles client requests to set their own capability configuration (user_preferences)
 */

import { CapabilitiesService } from '../../mcp/services/CapabilitiesService.js';
import { UserRepository } from '../../repositories/UserRepository.js';
import { SessionStore } from '../../mcp/core/SessionStore.js';
import { McpServerCapabilities, ServerConfigWithEnabled } from '../../mcp/types/mcp.js';
import { createLogger } from '../../logger/index.js';

export class SetCapabilitiesHandler {
  private capabilitiesService: CapabilitiesService;
  
  // Logger for SetCapabilitiesHandler
  private logger = createLogger('SetCapabilitiesHandler');

  constructor(private sessionStore: SessionStore) {
    // Get singleton instance
    this.capabilitiesService = CapabilitiesService.getInstance();
  }

  /**
   * Handle client request to set capability configuration
   * @param userId User ID
   * @param submittedCapabilities User submitted configuration (complete McpServerCapabilities)
   */
  async handleSetCapabilities(userId: string, submittedCapabilities: McpServerCapabilities): Promise<void> {
    // 1. Get current complete capabilities (for validation)
    const currentCapabilities = await this.capabilitiesService.getUserCapabilities(userId);

    // 2. Extract and validate enabled fields (only save enabled for existing items)
    const validatedPreferences = this.extractEnabledFields(submittedCapabilities, currentCapabilities);

    // 3. Update database
    await UserRepository.update(userId, {
      userPreferences: JSON.stringify(validatedPreferences)
    });

    this.logger.info({ userId }, 'User preferences updated');

    // 4. Notify all active sessions
    await this.sessionStore.updateUserPreferences(userId);
  }

  /**
   * Extract and validate enabled fields
   * Only save enabled status for server/tool/resource/prompt that exist in current
   * Ignore other fields and non-existent items
   *
   * @param submitted User submitted complete configuration
   * @param current Current actual complete configuration (for validation)
   * @returns Validated user_preferences (only contains enabled fields)
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

      const currentServer = current[serverId] as ServerConfigWithEnabled;
      const submittedServer = serverConfig as ServerConfigWithEnabled;

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
            if (typeof toolConfig.enabled === 'boolean') {
              validated[serverId].tools[toolName] = { enabled: toolConfig.enabled, description: toolConfig.description, dangerLevel: toolConfig.dangerLevel };
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
            if (typeof resourceConfig.enabled === 'boolean') {
              validated[serverId].resources[resourceName] = { enabled: resourceConfig.enabled, description: resourceConfig.description };
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
            if (typeof promptConfig.enabled === 'boolean') {
              validated[serverId].prompts[promptName] = { enabled: promptConfig.enabled, description: promptConfig.description };
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
}

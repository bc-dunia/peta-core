/**
 * CapabilitiesHandler - Socket capability configuration request handler
 *
 * Handles client-initiated requests to get capability configuration
 */

import { CapabilitiesService } from '../../mcp/services/CapabilitiesService.js';
import { McpServerCapabilities } from '../../mcp/types/mcp.js';

export class CapabilitiesHandler {
  private capabilitiesService: CapabilitiesService;

  constructor() {
    // Get singleton instance (assumed to be initialized at application startup)
    this.capabilitiesService = CapabilitiesService.getInstance();
  }

  /**
   * Handle client request to get capability configuration
   * @param userId User ID
   * @returns Promise<{ capabilities: McpServerCapabilities }>
   */
  async handleGetCapabilities(userId: string): Promise<{ capabilities: McpServerCapabilities }> {
    const capabilities = await this.capabilitiesService.getUserCapabilities(userId);
    return { capabilities };
  }
}

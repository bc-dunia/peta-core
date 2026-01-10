/**
 * CapabilitiesHandler - Socket capability configuration request handler
 *
 * Handles client-initiated requests to get capability configuration
 */

import { CapabilitiesService } from '../../mcp/services/CapabilitiesService.js';
import { McpServerCapabilities } from '../../mcp/types/mcp.js';

export class CapabilitiesHandler {

  /**
   * Handle client request to get capability configuration
   * @param userId User ID
   * @returns Promise<McpServerCapabilities>
   */
  static async handleGetCapabilities(userId: string): Promise<McpServerCapabilities> {
    const capabilitiesService = CapabilitiesService.getInstance();
    const capabilities = await capabilitiesService.getUserCapabilities(userId);
    return capabilities;
  }
}

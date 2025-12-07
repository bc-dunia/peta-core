/**
 * Cloudflared Tunnel Configuration
 * 
 * Supports two deployment modes:
 * 1. Docker deployment (PETA_CORE_IN_DOCKER=true): peta-core runs in container,
 *    cloudflared is a sibling container managed by docker-compose
 * 2. npm run start: peta-core runs on host, cloudflared runs in a standalone container
 */

import { ENV } from './config.js';

/**
 * Check if peta-core is running inside Docker container
 */
const isInDocker = ENV.PETA_CORE_IN_DOCKER === 'true';

export const CLOUDFLARED_CONFIG = {
  /**
   * Whether peta-core is running inside Docker container
   */
  IN_DOCKER: isInDocker,

  /**
   * Cloudflared container name
   * Can be overridden via CLOUDFLARED_CONTAINER_NAME environment variable
   */
  CONTAINER_NAME: ENV.CLOUDFLARED_CONTAINER_NAME || 'peta-mcp-gateway-cloudflared',

  /**
   * Configuration directory path
   * - Docker deployment: /app/cloudflared (absolute path inside container)
   * - npm run start: cloudflared (relative path from project root)
   */
  CONFIG_DIR: isInDocker ? '/app/cloudflared' : 'cloudflared',

  /**
   * Path that the cloudflared runtime (container or binary) uses to read configs.
   * Defaults to /etc/cloudflared because docker-compose mounts ./cloudflared there.
   * Can be overridden via CLOUDFLARED_CONTAINER_DIR if needed.
   */
  CONTAINER_CONFIG_DIR: ENV.CLOUDFLARED_CONTAINER_DIR || '/etc/cloudflared',

  /**
   * Docker image for cloudflared
   */
  IMAGE: 'cloudflare/cloudflared:latest',

  /**
   * peta-core service URL for cloudflared to proxy traffic to
   * - Docker deployment: http://peta-core:3002 (container name in same network)
   * - npm run start: http://host.docker.internal:3002 (access host from container)
   */
  PETA_CORE_SERVICE_URL: isInDocker
    ? `http://peta-core:${ENV.BACKEND_PORT || 3002}`
    : `http://host.docker.internal:${ENV.BACKEND_PORT || 3002}`,

  /**
   * Peta Cloud API base URL for tunnel creation/deletion
   */
  CLOUD_API_BASE_URL: ENV.PETA_CLOUD_API_URL || '',

  /**
   * Cloud API endpoints
   */
  CLOUD_API_ENDPOINTS: {
    tunnelCreate: '/tunnel/create',
    tunnelDelete: '/tunnel/delete',
  },
} as const;

export type CloudflaredConfig = typeof CLOUDFLARED_CONFIG;


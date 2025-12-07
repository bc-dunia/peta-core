/**
 * CloudflaredDockerService
 * 
 * Handles all Docker operations for cloudflared container management.
 * Supports two deployment modes:
 * - Docker deployment: peta-core runs in container, cloudflared is a sibling container
 * - npm run start: peta-core runs on host, cloudflared runs in a standalone container
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '../logger/index.js';
import { CLOUDFLARED_CONFIG } from '../config/cloudflaredConfig.js';

const execAsync = promisify(exec);
const logger = createLogger('CloudflaredDockerService');

export type ContainerStatus = 'running' | 'stopped' | 'not_exist';

/**
 * CloudflaredDockerService (Singleton)
 * Manages Docker operations for cloudflared container
 */
export class CloudflaredDockerService {
  private static instance: CloudflaredDockerService;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): CloudflaredDockerService {
    if (!CloudflaredDockerService.instance) {
      CloudflaredDockerService.instance = new CloudflaredDockerService();
    }
    return CloudflaredDockerService.instance;
  }

  /**
   * Check if Docker daemon is available
   * @returns true if Docker is running and accessible
   */
  async checkDockerAvailable(): Promise<boolean> {
    try {
      await execAsync('docker info', { timeout: 5000 });
      return true;
    } catch (error: any) {
      logger.warn({ error: error.message }, 'Docker is not available');
      return false;
    }
  }

  /**
   * Check if cloudflared Docker image exists locally
   * @returns true if image exists
   */
  async checkImageExists(): Promise<boolean> {
    try {
      const { stdout } = await execAsync(
        `docker images ${CLOUDFLARED_CONFIG.IMAGE} --format "{{.Repository}}"`,
        { timeout: 10000 }
      );
      return stdout.trim().includes('cloudflare/cloudflared');
    } catch (error: any) {
      logger.warn({ error: error.message }, 'Failed to check image existence');
      return false;
    }
  }

  /**
   * Pull cloudflared Docker image
   * This operation may take a while and blocks until complete
   */
  async pullImage(): Promise<void> {
    logger.info({ image: CLOUDFLARED_CONFIG.IMAGE }, 'Pulling cloudflared Docker image...');
    try {
      await execAsync(`docker pull ${CLOUDFLARED_CONFIG.IMAGE}`, { timeout: 300000 }); // 5 minutes timeout
      logger.info({ image: CLOUDFLARED_CONFIG.IMAGE }, 'Cloudflared Docker image pulled successfully');
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to pull cloudflared Docker image');
      throw new Error(`Failed to pull cloudflared image: ${error.message}`);
    }
  }

  /**
   * Ensure cloudflared Docker image exists
   * Only pulls image if not in Docker deployment mode (when PETA_CORE_IN_DOCKER is not true)
   * In Docker deployment, docker-compose manages the image
   */
  async ensureImageExists(): Promise<void> {
    // Skip image check/pull in Docker deployment mode
    if (CLOUDFLARED_CONFIG.IN_DOCKER) {
      logger.debug('Skipping image check in Docker deployment mode');
      return;
    }

    const exists = await this.checkImageExists();
    if (!exists) {
      logger.info('Cloudflared image not found, pulling...');
      await this.pullImage();
    } else {
      logger.debug('Cloudflared image already exists');
    }
  }

  /**
   * Get cloudflared container status
   * @returns 'running' | 'stopped' | 'not_exist'
   */
  async getContainerStatus(): Promise<ContainerStatus> {
    const containerName = CLOUDFLARED_CONFIG.CONTAINER_NAME;
    
    try {
      // Check if container is running
      const { stdout: runningOutput } = await execAsync(
        `docker ps --filter "name=${containerName}" --filter "status=running" --format "{{.Names}}"`,
        { timeout: 10000 }
      );

      if (runningOutput.trim() === containerName) {
        return 'running';
      }

      // Check if container exists but is stopped
      const { stdout: allOutput } = await execAsync(
        `docker ps -a --filter "name=${containerName}" --format "{{.Names}}"`,
        { timeout: 10000 }
      );

      if (allOutput.trim() === containerName) {
        return 'stopped';
      }

      return 'not_exist';
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to get container status');
      return 'not_exist';
    }
  }

  /**
   * Start cloudflared container
   * Tries to start existing container first, then creates new one via docker-compose if needed
   */
  async startContainer(): Promise<void> {
    const containerName = CLOUDFLARED_CONFIG.CONTAINER_NAME;
    const status = await this.getContainerStatus();

    try {
      if (status === 'running') {
        logger.info({ containerName }, 'Container is already running');
        return;
      }

      if (status === 'stopped') {
        // Start existing stopped container
        await execAsync(`docker start ${containerName}`, { timeout: 30000 });
        logger.info({ containerName }, 'Started existing container');
        return;
      }

      // Container doesn't exist, create it with docker-compose
      await execAsync('docker compose up -d cloudflared', { timeout: 60000 });
      logger.info({ containerName }, 'Created and started container via docker-compose');
    } catch (error: any) {
      logger.error({ error: error.message, containerName }, 'Failed to start container');
      throw new Error(`Failed to start cloudflared container: ${error.message}`);
    }
  }

  /**
   * Stop cloudflared container
   */
  async stopContainer(): Promise<void> {
    const containerName = CLOUDFLARED_CONFIG.CONTAINER_NAME;
    
    try {
      const status = await this.getContainerStatus();
      
      if (status !== 'running') {
        logger.debug({ containerName, status }, 'Container is not running, skip stop');
        return;
      }

      await execAsync(`docker stop ${containerName}`, { timeout: 30000 });
      logger.info({ containerName }, 'Container stopped successfully');
    } catch (error: any) {
      // If the stop command was interrupted by SIGINT (common when shutdown is triggered via Ctrl+C),
      // treat it as best-effort success because the container likely received SIGTERM already.
      if (error.code === 130 || error.signal === 'SIGINT') {
        logger.warn(
          { containerName, code: error.code, signal: error.signal },
          'docker stop interrupted by SIGINT, treating as success'
        );
        return;
      }
      // Ignore errors if container doesn't exist or is already stopped
      if (!error.message.includes('No such container') && !error.message.includes('is not running')) {
        logger.error({ error: error.message, containerName }, 'Failed to stop container');
        throw new Error(`Failed to stop cloudflared container: ${error.message}`);
      }
    }
  }

  /**
   * Restart cloudflared container
   * If container doesn't exist, creates and starts it
   */
  async restartContainer(): Promise<void> {
    const containerName = CLOUDFLARED_CONFIG.CONTAINER_NAME;
    const status = await this.getContainerStatus();

    try {
      if (status === 'running') {
        await execAsync(`docker restart ${containerName}`, { timeout: 30000 });
        logger.info({ containerName }, 'Container restarted successfully');
      } else if (status === 'stopped') {
        await execAsync(`docker start ${containerName}`, { timeout: 30000 });
        logger.info({ containerName }, 'Started stopped container');
      } else {
        // Container doesn't exist, create it
        await execAsync('docker compose up -d cloudflared', { timeout: 60000 });
        logger.info({ containerName }, 'Created and started container via docker-compose');
      }
    } catch (error: any) {
      logger.error({ error: error.message, containerName }, 'Failed to restart container');
      throw new Error(`Failed to restart cloudflared container: ${error.message}`);
    }
  }

  /**
   * Delete cloudflared container
   * Stops the container first if it's running
   */
  async deleteContainer(): Promise<void> {
    const containerName = CLOUDFLARED_CONFIG.CONTAINER_NAME;
    
    try {
      const status = await this.getContainerStatus();
      
      if (status === 'not_exist') {
        logger.debug({ containerName }, 'Container does not exist, skip delete');
        return;
      }

      // Stop first if running
      if (status === 'running') {
        await this.stopContainer();
      }

      // Remove container
      await execAsync(`docker rm ${containerName}`, { timeout: 10000 });
      logger.info({ containerName }, 'Container deleted successfully');
    } catch (error: any) {
      // Ignore errors if container doesn't exist
      if (!error.message.includes('No such container')) {
        logger.error({ error: error.message, containerName }, 'Failed to delete container');
        throw new Error(`Failed to delete cloudflared container: ${error.message}`);
      }
    }
  }
}

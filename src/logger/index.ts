import pino, { Logger } from 'pino';
import { loggerConfig, loggingConfig } from './LoggerConfig.js';

/**
 * Root logger instance
 * Used for application-level logging
 */
export const rootLogger: Logger = pino(loggerConfig);

/**
 * Create a child logger with a specific name and optional context
 *
 * @param name - Logger name (e.g., 'ServerManager', 'ProxySession')
 * @param context - Optional context object (e.g., { sessionId, userId })
 * @returns Child logger instance
 *
 * @example
 * const logger = createLogger('ServerManager', { serverId: 'gdrive' });
 * logger.info('Server connected');
 * // Output: {"level":"info","name":"ServerManager","serverId":"gdrive","msg":"Server connected"}
 */
export function createLogger(name: string, context?: Record<string, any>): Logger {
  return rootLogger.child({
    name,
    ...context,
  });
}

/**
 * Export logging configuration for reference
 */
export { loggingConfig };

/**
 * Export Logger type for convenience
 */
export type { Logger };

/**
 * Initialize logger and log startup info
 */
rootLogger.info(
  {
    level: loggingConfig.level,
    pretty: loggingConfig.prettyPrint,
    env: loggingConfig.isDevelopment ? 'development' : 'production',
  },
  'Logger initialized'
);

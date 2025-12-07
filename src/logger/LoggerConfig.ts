import type { LoggerOptions } from 'pino';

/**
 * Pino logger configuration
 * - Development: Pretty format with trace level
 * - Production: JSON format with info level (or configurable via LOG_LEVEL)
 */

const isDevelopment = process.env.NODE_ENV === 'development';

// Get log level from environment or use defaults
const defaultLogLevel = isDevelopment ? 'trace' : 'info';
const logLevel = (process.env.LOG_LEVEL || defaultLogLevel) as 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

// Pretty printing enabled by default in development, or via LOG_PRETTY env var
const shouldPrettyPrint = process.env.LOG_PRETTY === 'true' || (isDevelopment && process.env.LOG_PRETTY !== 'false');

/**
 * Base Pino configuration
 */
export const loggerConfig: LoggerOptions = {
  level: logLevel,

  // Base fields added to every log entry
  base: {
    pid: process.pid,
    hostname: process.env.HOSTNAME || 'unknown',
    env: process.env.NODE_ENV || 'development',
  },

  // Timestamp configuration
  timestamp: () => `,"time":"${new Date().toISOString()}"`,

  // Pretty printing for development
  ...(shouldPrettyPrint && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname,env', // Hide pid, hostname, env (env is always development in dev environment, redundant)
        singleLine: false,
      },
    },
  }),
};

/**
 * Export configuration values for reference
 */
export const loggingConfig = {
  level: logLevel,
  isDevelopment,
  prettyPrint: shouldPrettyPrint,
};

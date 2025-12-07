/**
 * EventStore configuration interface and default configuration
 */

export interface EventStoreConfig {
  // Cache configuration
  maxCacheSize: number;
  maxStreamEvents: number;
  
  // Storage configuration
  eventRetentionDays: number;
  cleanupIntervalHours: number;
  
  // Database configuration
  database: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  };
  
  // Performance configuration
  batchSize: number;
  enableCompression: boolean;
  enablePartitioning: boolean;
}

export const defaultEventStoreConfig: EventStoreConfig = {
  maxCacheSize: 1000,
  maxStreamEvents: 100,
  eventRetentionDays: 7,
  cleanupIntervalHours: 24,
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    database: process.env.DB_NAME || 'mcp_gateway',
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  },
  batchSize: 100,
  enableCompression: false,
  enablePartitioning: false
};

/**
 * Load configuration from environment variables
 */
export function loadEventStoreConfig(): EventStoreConfig {
  const config = { ...defaultEventStoreConfig };
  
  // Override with environment variable configuration
  if (process.env.EVENT_STORE_MAX_CACHE_SIZE) {
    config.maxCacheSize = parseInt(process.env.EVENT_STORE_MAX_CACHE_SIZE);
  }
  
  if (process.env.EVENT_STORE_MAX_STREAM_EVENTS) {
    config.maxStreamEvents = parseInt(process.env.EVENT_STORE_MAX_STREAM_EVENTS);
  }
  
  if (process.env.EVENT_STORE_RETENTION_DAYS) {
    config.eventRetentionDays = parseInt(process.env.EVENT_STORE_RETENTION_DAYS);
  }
  
  if (process.env.EVENT_STORE_CLEANUP_INTERVAL_HOURS) {
    config.cleanupIntervalHours = parseInt(process.env.EVENT_STORE_CLEANUP_INTERVAL_HOURS);
  }
  
  if (process.env.EVENT_STORE_BATCH_SIZE) {
    config.batchSize = parseInt(process.env.EVENT_STORE_BATCH_SIZE);
  }
  
  if (process.env.EVENT_STORE_ENABLE_COMPRESSION) {
    config.enableCompression = process.env.EVENT_STORE_ENABLE_COMPRESSION === 'true';
  }
  
  if (process.env.EVENT_STORE_ENABLE_PARTITIONING) {
    config.enablePartitioning = process.env.EVENT_STORE_ENABLE_PARTITIONING === 'true';
  }
  
  return config;
}

/**
 * Validate configuration validity
 */
export function validateEventStoreConfig(config: EventStoreConfig): string[] {
  const errors: string[] = [];
  
  if (config.maxCacheSize <= 0) {
    errors.push('maxCacheSize must be greater than 0');
  }
  
  if (config.maxStreamEvents <= 0) {
    errors.push('maxStreamEvents must be greater than 0');
  }
  
  if (config.eventRetentionDays <= 0) {
    errors.push('eventRetentionDays must be greater than 0');
  }
  
  if (config.cleanupIntervalHours <= 0) {
    errors.push('cleanupIntervalHours must be greater than 0');
  }
  
  if (config.batchSize <= 0) {
    errors.push('batchSize must be greater than 0');
  }
  
  if (!config.database.host) {
    errors.push('Database host is required');
  }
  
  if (!config.database.database) {
    errors.push('Database name is required');
  }
  
  return errors;
}

/**
 * Get environment-specific configuration
 */
export function getEnvironmentConfig(): EventStoreConfig {
  const env = process.env.NODE_ENV || 'development';
  
  switch (env) {
    case 'production':
      return {
        ...defaultEventStoreConfig,
        maxCacheSize: 10000,
        maxStreamEvents: 1000,
        eventRetentionDays: 30,
        cleanupIntervalHours: 6,
        batchSize: 500,
        enableCompression: true,
        enablePartitioning: true
      };
      
    case 'staging':
      return {
        ...defaultEventStoreConfig,
        maxCacheSize: 5000,
        maxStreamEvents: 500,
        eventRetentionDays: 14,
        cleanupIntervalHours: 12,
        batchSize: 250,
        enableCompression: false,
        enablePartitioning: false
      };
      
    case 'test':
      return {
        ...defaultEventStoreConfig,
        maxCacheSize: 100,
        maxStreamEvents: 10,
        eventRetentionDays: 1,
        cleanupIntervalHours: 1,
        batchSize: 10,
        enableCompression: false,
        enablePartitioning: false
      };
      
    default: // development
      return defaultEventStoreConfig;
  }
}

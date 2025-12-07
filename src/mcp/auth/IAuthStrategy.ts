/**
 * Token information interface
 */
export interface TokenInfo {
  /**
   * Access token
   */
  accessToken: string;

  /**
   * Expiration time (seconds, calculated from acquisition time)
   */
  expiresIn: number;

  /**
   * Absolute expiration time (Unix timestamp, milliseconds)
   */
  expiresAt: number;
}

/**
 * Authentication strategy interface
 *
 * Used to implement token management logic for different OAuth providers
 */
export interface IAuthStrategy {
  /**
   * Get initial token (called when server starts)
   *
   * @returns Token information
   */
  getInitialToken(): Promise<TokenInfo>;

  /**
   * Refresh token
   *
   * @returns New token information
   */
  refreshToken(): Promise<TokenInfo>;

  /**
   * Get current complete OAuth configuration (optional)
   *
   * Used to support complete persistence of OAuth configuration (e.g., Notion OAuth token caching)
   * Some OAuth providers support token caching and require full configuration persistence to avoid unnecessary refreshes
   *
   * @returns Current complete OAuth configuration, returns undefined if persistence is not needed
   */
  getCurrentOAuthConfig?(): any;

  /**
   * Mark configuration as persisted (optional)
   *
   * Called after external successfully persists OAuth configuration to database
   * Used to reset internal "configuration changed" flag to avoid duplicate persistence
   *
   * Typical usage scenarios:
   * - Configuration updated after token refresh (accessToken, refreshToken, etc.)
   * - After successful database write, call this method to notify strategy
   * - Next time if cached token is used, won't trigger database update again
   */
  markConfigAsPersisted?(): void;

  /**
   * Cleanup resources (optional)
   *
   * Called when server shuts down, used to clean up timers, connections, and other resources
   */
  cleanup?(): void;
}

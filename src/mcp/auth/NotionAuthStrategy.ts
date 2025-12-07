import { IAuthStrategy, TokenInfo } from './IAuthStrategy.js';

/**
 * Notion OAuth configuration
 */
interface NotionOAuthConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken: string;
  expiresAt?: number;
}

/**
 * Notion Token API response
 */
interface NotionTokenResponse {
  access_token: string;
  refresh_token: string;  // Notion returns a new refresh_token on each refresh
  bot_id: string;
  owner: any;
  workspace_id: string;
}

/**
 * Notion OAuth authentication strategy
 *
 * Implements Notion OAuth 2.0 token acquisition and refresh logic
 *
 * Key features:
 * - Uses HTTP Basic Authentication (instead of form parameters)
 * - Token does not expire by default (unless configured by enterprise admin), uses 30 days as safe refresh cycle
 * - Each refresh returns a new refresh_token, requires persistence update
 */
export class NotionAuthStrategy implements IAuthStrategy {
  private static readonly TOKEN_ENDPOINT = 'https://api.notion.com/v1/oauth/token';
  /**
   * Default expiration time: 30 days (seconds)
   *
   * Notion access token does not expire by default, but to be compatible with possible enterprise configurations
   * and detect token invalidation issues in time, set 30 days as refresh cycle
   */
  private static readonly DEFAULT_EXPIRES_IN = 30 * 24 * 60 * 60; // 30 days

  /**
   * Flag indicating if configuration has unpersisted changes
   *
   * - Remains false when using cached token (no persistence needed)
   * - Set to true after calling API to get new token (persistence needed)
   * - Reset to false via markConfigAsPersisted() after external persistence succeeds
   */
  private configChanged: boolean = false;

  constructor(private config: NotionOAuthConfig) {
    this.validateConfig();
  }

  /**
   * Validate configuration completeness
   */
  private validateConfig(): void {
    if (!this.config.clientId) {
      throw new Error('Notion OAuth: clientId is required');
    }
    if (!this.config.clientSecret) {
      throw new Error('Notion OAuth: clientSecret is required');
    }
    if (!this.config.refreshToken) {
      throw new Error('Notion OAuth: refreshToken is required');
    }
  }

  /**
   * Get initial token (exchange refresh token for access token)
   */
  async getInitialToken(): Promise<TokenInfo> {
    return await this.refreshToken();
  }

  /**
   * Refresh access token
   *
   * Optimized logic: first check if cached accessToken is expired, return directly if not expired
   * This is especially important for frequently started temporary servers, can avoid unnecessary API calls
   */
  async refreshToken(): Promise<TokenInfo> {
    // 1. Check if there is cached accessToken and expiresAt
    if (this.config.accessToken && this.config.expiresAt) {
      const now = Date.now();

      // 2. Determine if expired (consider expired 5 minutes early to avoid edge cases)
      const EXPIRY_BUFFER = 5 * 60 * 1000; // 5 minutes
      if (now < this.config.expiresAt - EXPIRY_BUFFER) {
        // 3. Not expired, return cached token directly
        const expiresIn = Math.floor((this.config.expiresAt - now) / 1000);

        console.log(`[NotionAuthStrategy] Using cached token for ${this.config.clientId?.substring(0, 8)}..., expires in ${Math.floor(expiresIn / 3600)} hours`);

        return {
          accessToken: this.config.accessToken,
          expiresIn: expiresIn,
          expiresAt: this.config.expiresAt,
        };
      }

      console.log(`[NotionAuthStrategy] Cached token expired or expiring soon, refreshing...`);
    }

    // 4. No cache or expired, request new token
    try {
      console.log(`[NotionAuthStrategy] Requesting new token from Notion API...`);

      // HTTP Basic Auth: base64(clientId:clientSecret)
      const credentials = `${this.config.clientId}:${this.config.clientSecret}`;
      const encoded = Buffer.from(credentials).toString('base64');

      const response = await fetch(NotionAuthStrategy.TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Basic ${encoded}`,
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: this.config.refreshToken,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Notion OAuth token refresh failed (${response.status}): ${errorText}`
        );
      }

      const data: NotionTokenResponse = await response.json();

      // Notion does not return expires_in field (token does not expire by default)
      // Use 30 days as safe refresh cycle
      const expiresIn = NotionAuthStrategy.DEFAULT_EXPIRES_IN;
      const expiresAt = Date.now() + expiresIn * 1000;

      // ⚠️ Important: Update internal configuration
      // Notion returns a new refresh_token on each refresh (token rotation mechanism)
      // Also save accessToken and expiresAt for caching on next startup
      this.config.accessToken = data.access_token;
      this.config.refreshToken = data.refresh_token;
      this.config.expiresAt = expiresAt;

      // Mark configuration as changed, needs to be persisted to database
      this.configChanged = true;

      console.log(`[NotionAuthStrategy] New token obtained, expires in ${expiresIn / 86400} days`);

      return {
        accessToken: data.access_token,
        expiresIn: expiresIn,
        expiresAt: expiresAt,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Notion OAuth token refresh error: ${error.message}`);
      }
      throw new Error('Notion OAuth token refresh error: Unknown error');
    }
  }

  /**
   * Get current complete OAuth configuration
   *
   * Returns complete configuration including clientId, clientSecret, refreshToken, accessToken, expiresAt
   * Used for persistence to database, can directly use cached token on next startup
   *
   * ⚠️ Optimization: only return when configuration actually changes (avoid unnecessary database updates)
   * - If cached token is used (API not called), return undefined
   * - If API is called to get new token, return complete configuration for persistence
   */
  getCurrentOAuthConfig(): NotionOAuthConfig | undefined {
    // Only return when configuration actually changes (needs persistence)
    if (!this.configChanged) {
      return undefined;  // No changes, no need to update database
    }

    return {
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      refreshToken: this.config.refreshToken,
      accessToken: this.config.accessToken,
      expiresAt: this.config.expiresAt,
    };
  }

  /**
   * Mark configuration as persisted
   *
   * Called after external successfully persists OAuth configuration to database
   * Reset configChanged flag to avoid duplicate database updates on next cache hit
   */
  markConfigAsPersisted(): void {
    this.configChanged = false;
  }

  /**
   * Cleanup resources (Notion OAuth doesn't require special cleanup)
   */
  cleanup(): void {
    // No cleanup needed for Notion OAuth
  }
}

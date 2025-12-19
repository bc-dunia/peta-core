import { IAuthStrategy, TokenInfo } from './IAuthStrategy.js';

/**
 * Figma OAuth configuration
 */
interface FigmaOAuthConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken?: string;
  expiresAt?: number;
}

/**
 * Figma Token API response
 */
interface FigmaTokenResponse {
  access_token: string;
  token_type: string; // "bearer"
  expires_in: number; // seconds, typically 7776000 (90 days)
}

/**
 * Figma OAuth authentication strategy
 *
 * Implements Figma OAuth 2.0 token acquisition and refresh logic
 *
 * Key features:
 * - Uses HTTP Basic Authentication (similar to Notion)
 * - Token expires in 90 days by default
 * - refresh_token does not change on refresh (unlike Notion, similar to Google)
 * - Implements token caching to avoid unnecessary API calls
 */
export class FigmaAuthStrategy implements IAuthStrategy {
  private static readonly TOKEN_ENDPOINT = 'https://api.figma.com/v1/oauth/refresh';

  /**
   * Flag indicating if configuration has unpersisted changes
   *
   * - Remains false when using cached token (no persistence needed)
   * - Set to true after calling API to get new token (persistence needed)
   * - Reset to false via markConfigAsPersisted() after external persistence succeeds
   */
  private configChanged: boolean = false;

  constructor(private config: FigmaOAuthConfig) {
    this.validateConfig();
  }

  /**
   * Validate configuration completeness
   */
  private validateConfig(): void {
    if (!this.config.clientId) {
      throw new Error('Figma OAuth: clientId is required');
    }
    if (!this.config.clientSecret) {
      throw new Error('Figma OAuth: clientSecret is required');
    }
    if (!this.config.refreshToken) {
      throw new Error('Figma OAuth: refreshToken is required');
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

        console.log(`[FigmaAuthStrategy] Using cached token for ${this.config.clientId?.substring(0, 8)}..., expires in ${Math.floor(expiresIn / 3600)} hours`);

        return {
          accessToken: this.config.accessToken,
          expiresIn: expiresIn,
          expiresAt: this.config.expiresAt,
        };
      }

      console.log(`[FigmaAuthStrategy] Cached token expired or expiring soon, refreshing...`);
    }

    // 4. No cache or expired, request new token
    try {
      console.log(`[FigmaAuthStrategy] Requesting new token from Figma API...`);

      // HTTP Basic Auth: base64(clientId:clientSecret)
      const credentials = `${this.config.clientId}:${this.config.clientSecret}`;
      const encoded = Buffer.from(credentials).toString('base64');

      const response = await fetch(FigmaAuthStrategy.TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${encoded}`,
        },
        body: new URLSearchParams({
          refresh_token: this.config.refreshToken,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Figma OAuth token refresh failed (${response.status}): ${errorText}`
        );
      }

      const data: FigmaTokenResponse = await response.json();

      // Calculate absolute expiration time
      const expiresIn = data.expires_in;
      const expiresAt = Date.now() + expiresIn * 1000;

      // ⚠️ Important: Update internal configuration
      // Figma does NOT return a new refresh_token (unlike Notion)
      // Only update accessToken and expiresAt
      this.config.accessToken = data.access_token;
      this.config.expiresAt = expiresAt;
      // this.config.refreshToken remains unchanged

      // Mark configuration as changed, needs to be persisted to database
      this.configChanged = true;

      console.log(`[FigmaAuthStrategy] New token obtained, expires in ${expiresIn / 86400} days`);

      return {
        accessToken: data.access_token,
        expiresIn: expiresIn,
        expiresAt: expiresAt,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Figma OAuth token refresh error: ${error.message}`);
      }
      throw new Error('Figma OAuth token refresh error: Unknown error');
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
  getCurrentOAuthConfig(): FigmaOAuthConfig | undefined {
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
   * Cleanup resources (Figma OAuth doesn't require special cleanup)
   */
  cleanup(): void {
    // No cleanup needed for Figma OAuth
  }
}

import { IAuthStrategy, TokenInfo } from './IAuthStrategy.js';
import { ServerAuthType } from '../../types/enums.js';
import { createLogger } from '../../logger/index.js';
import { Server } from '@prisma/client';
import { CryptoService } from '../../security/CryptoService.js';

interface PetaOAuthConfig {
  userToken: string;
  server: Server;
  clientId: string;
  accessToken?: string;
  expiresAt?: number;
}

const logger = createLogger('PetaAuthStrategy');

export class PetaAuthStrategy implements IAuthStrategy {
  constructor(private config: PetaOAuthConfig) {
    this.validateConfig();
  }

  private validateConfig(): void {
    if (!this.config.userToken || this.config.userToken.trim() === '') {
      throw new Error('Peta OAuth: userToken is required');
    }
    if (!this.config.clientId) {
      throw new Error('Peta OAuth: clientId is required');
    }

    if (this.config.expiresAt !== undefined) {
      this.config.expiresAt = this.normalizeExpiresAt(this.config.expiresAt);
    }
  }

  private normalizeExpiresAt(expiresAt: number): number {
    // Treat values that look like seconds as seconds.
    return expiresAt < 10_000_000_000 ? expiresAt * 1000 : expiresAt;
  }

  private isCachedTokenValid(): boolean {
    if (!this.config.accessToken || !this.config.expiresAt) {
      return false;
    }

    const now = Date.now();
    const EXPIRY_BUFFER = 5 * 60 * 1000;
    return now < this.config.expiresAt - EXPIRY_BUFFER;
  }

  async getInitialToken(): Promise<TokenInfo> {
    return await this.refreshToken();
  }

  async refreshToken(): Promise<TokenInfo> {
    if (this.isCachedTokenValid()) {
      const expiresIn = Math.floor((this.config.expiresAt! - Date.now()) / 1000);
      logger.info({
        serverId: this.config.server.serverId,
        expiresIn
      }, 'Using cached Peta OAuth token');

      return {
        accessToken: this.config.accessToken!,
        expiresIn,
        expiresAt: this.config.expiresAt!
      };
    }

    const tokenInfo = await this.refreshTokenFromPeta();
    this.config.accessToken = tokenInfo.accessToken;
    this.config.expiresAt = tokenInfo.expiresAt;
    return tokenInfo;
  }

  private async refreshTokenFromPeta(): Promise<TokenInfo> {
    logger.warn({
      serverId: this.config.server.serverId,
      authType: this.config.server.authType,
      clientId: this.config.clientId
    }, 'Peta OAuth refresh not implemented');

    const keyLength = Math.ceil(this.config.userToken.length * 0.5);
    const key = this.config.userToken.substring(keyLength) + this.config.server.serverId + this.config.server.allowUserInput.toString();
    const hashKey = await CryptoService.hash(key);

    throw new Error('Peta OAuth refresh not implemented');
  }

  cleanup(): void {
    // No cleanup needed for Peta OAuth
  }
}

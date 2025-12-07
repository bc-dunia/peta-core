/**
 * OAuth Client Management Service
 * Handles client registration, query, update and other operations
 */

import { prisma } from '../../config/prisma.js';
import { OAuthService } from './OAuthService.js';
import { OAuthClientMetadata, OAuthClientInformation } from '../types/oauth.types.js';
import { createLogger } from '../../logger/index.js';
import { ClientMetadataFetcher } from './ClientMetadataFetcher.js';

export class OAuthClientService {
  private oauthService: OAuthService;
  private logger = createLogger('OAuthClientService');

  constructor() {
    this.oauthService = new OAuthService();
  }

  /**
   * Dynamic client registration (RFC 7591 + SEP-991)
   */
  async registerClient(
    metadata: OAuthClientMetadata,
    userId?: string
  ): Promise<OAuthClientInformation> {
    // ========== New: SEP-991 URL-based Client ID handling ==========

    // 1. Check if using URL-based client ID
    // Criteria: metadata provides client_id and that client_id is an HTTPS URL
    const providedClientId = metadata.client_id;
    const isUrlBasedClientId = providedClientId && typeof providedClientId === 'string' && providedClientId.startsWith('https://');

    if (isUrlBasedClientId) {
      this.logger.info({
        clientId: providedClientId,
        providedMetadata: {
          client_name: metadata.client_name,
          redirect_uris: metadata.redirect_uris
        }
      }, 'URL-based client ID registration detected');

      // 2. Use ClientMetadataFetcher to fetch and validate client metadata
      const fetcher = new ClientMetadataFetcher();
      const validationResult = await fetcher.fetchAndValidateClientMetadata(providedClientId);

      if (!validationResult.valid) {
        this.logger.warn({
          clientId: providedClientId,
          error: validationResult.error,
          errorDescription: validationResult.errorDescription
        }, 'URL-based client ID validation failed');

        throw new Error(`${validationResult.error}: ${validationResult.errorDescription}`);
      }

      // 3. Use metadata fetched from URL (takes priority over metadata in request)
      const fetchedMetadata = validationResult.metadata!;

      this.logger.info({
        clientId: providedClientId,
        fetchedMetadata: {
          client_name: fetchedMetadata.client_name,
          redirect_uris: fetchedMetadata.redirect_uris,
          grant_types: fetchedMetadata.grant_types,
          token_endpoint_auth_method: fetchedMetadata.token_endpoint_auth_method
        }
      }, 'Client metadata fetched successfully from URL');

      // 4. Check if a client with this URL as client_id already exists in database
      const existingClient = await prisma.oAuthClient.findUnique({
        where: { clientId: providedClientId }
      });

      if (existingClient) {
        this.logger.info({
          clientId: providedClientId
        }, 'URL-based client already registered, returning existing client');

        return {
          client_id: existingClient.clientId,
          client_secret: existingClient.clientSecret || undefined,
          client_name: existingClient.name,
          redirect_uris: existingClient.redirectUris as string[],
          grant_types: existingClient.grantTypes as string[],
          scopes: existingClient.scopes as string[],
          token_endpoint_auth_method: existingClient.tokenEndpointAuthMethod,
          trusted: existingClient.trusted,
          created_at: existingClient.createdAt,
          updated_at: existingClient.updatedAt,
        };
      }

      // 5. Create new URL-based client record
      const authMethod = fetchedMetadata.token_endpoint_auth_method || 'none';
      const scopes = this.oauthService.parseScope(fetchedMetadata.scope);
      const grantTypes = fetchedMetadata.grant_types || ['authorization_code', 'refresh_token'];
      const responseTypes = fetchedMetadata.response_types || ['code'];

      // URL-based client doesn't need client_secret (identity verified through URL)
      const client = await prisma.oAuthClient.create({
        data: {
          clientId: providedClientId, // URL as client_id
          clientSecret: null, // URL-based clients don't use secret
          name: fetchedMetadata.client_name || `URL Client ${providedClientId}`,
          redirectUris: fetchedMetadata.redirect_uris,
          grantTypes,
          responseTypes,
          scopes,
          tokenEndpointAuthMethod: authMethod,
          userId: userId ?? undefined,
          trusted: false,
        },
      });

      this.logger.info({
        clientId: providedClientId,
        clientName: client.name
      }, 'URL-based client registered successfully');

      return {
        client_id: client.clientId,
        client_secret: undefined, // URL-based clients don't return secret
        client_name: client.name,
        redirect_uris: client.redirectUris as string[],
        grant_types: client.grantTypes as string[],
        scopes: client.scopes as string[],
        token_endpoint_auth_method: client.tokenEndpointAuthMethod,
        trusted: client.trusted,
        created_at: client.createdAt,
        updated_at: client.updatedAt,
      };
    }

    // ========== Original traditional client registration logic ==========

    // Decide whether to generate client_secret based on authentication method
    const authMethod = metadata.token_endpoint_auth_method || 'client_secret_post';

    // Parse and validate scope
    const scopes = this.oauthService.parseScope(metadata.scope);

    // Default grant types and response types
    const grantTypes = metadata.grant_types || ['authorization_code', 'refresh_token'];
    const responseTypes = metadata.response_types || ['code'];

    // Check for duplicate clients (global uniqueness check)
    // Duplicate criteria: name + redirectUris + tokenEndpointAuthMethod + grantTypes all the same
    // Note: Only perform duplicate check when client_name is explicitly provided
    if (metadata.client_name) {
      const existingClient = await prisma.oAuthClient.findFirst({
        where: {
          name: metadata.client_name,
          redirectUris: { equals: metadata.redirect_uris },
          tokenEndpointAuthMethod: authMethod,
          grantTypes: { equals: grantTypes },
          responseTypes: { equals: responseTypes },
        },
      });

      // If duplicate client found, return existing client information
      if (existingClient) {
        this.logger.info({
          existingClientId: existingClient.clientId,
          attemptedClientName: metadata.client_name,
          redirectUris: metadata.redirect_uris,
          authMethod,
          grantTypes,
        }, 'Duplicate client registration detected, returning existing client');

        return {
          client_id: existingClient.clientId,
          client_secret: existingClient.clientSecret || undefined,
          client_name: existingClient.name,
          redirect_uris: existingClient.redirectUris as string[],
          grant_types: existingClient.grantTypes as string[],
          scopes: existingClient.scopes as string[],
          token_endpoint_auth_method: existingClient.tokenEndpointAuthMethod,
          trusted: existingClient.trusted,
          created_at: existingClient.createdAt,
          updated_at: existingClient.updatedAt,
        };
      }
    }

    // Generate client credentials (only when confirmed to create new client)
    const clientId = this.oauthService.generateClientId();
    const clientSecret = authMethod === 'none'
      ? undefined
      : this.oauthService.generateClientSecret();

    // Create client record
    const client = await prisma.oAuthClient.create({
      data: {
        clientId,
        clientSecret,
        name: metadata.client_name || `Client ${clientId}`,
        redirectUris: metadata.redirect_uris,
        grantTypes,
        responseTypes,
        scopes,
        tokenEndpointAuthMethod: authMethod,
        userId: userId ?? undefined,
        trusted: false,
      },
    });

    return {
      client_id: client.clientId,
      client_secret: clientSecret,
      client_name: client.name,
      redirect_uris: client.redirectUris as string[],
      grant_types: client.grantTypes as string[],
      scopes: client.scopes as string[],
      token_endpoint_auth_method: client.tokenEndpointAuthMethod,
      trusted: client.trusted,
      created_at: client.createdAt,
      updated_at: client.updatedAt,
    };
  }

  /**
   * Get client information by client_id
   */
  async getClient(clientId: string): Promise<OAuthClientInformation | null> {
    const client = await prisma.oAuthClient.findUnique({
      where: { clientId },
    });

    if (!client) {
      return null;
    }

    return {
      client_id: client.clientId,
      client_secret: client.clientSecret || undefined,
      client_name: client.name,
      redirect_uris: client.redirectUris as string[],
      grant_types: client.grantTypes as string[],
      scopes: client.scopes as string[],
      token_endpoint_auth_method: client.tokenEndpointAuthMethod,
      trusted: client.trusted,
      created_at: client.createdAt,
      updated_at: client.updatedAt,
    };
  }

  /**
   * Get all clients (admin function)
   */
  async listClients(userId?: string): Promise<OAuthClientInformation[]> {
    const where = userId ? { userId } : {};

    const clients = await prisma.oAuthClient.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return clients.map(client => ({
      client_id: client.clientId,
      // Don't return client_secret
      client_name: client.name,
      redirect_uris: client.redirectUris as string[],
      grant_types: client.grantTypes as string[],
      scopes: client.scopes as string[],
      token_endpoint_auth_method: client.tokenEndpointAuthMethod,
      trusted: client.trusted,
      created_at: client.createdAt,
      updated_at: client.updatedAt,
    }));
  }

  /**
   * Update client information
   */
  async updateClient(
    clientId: string,
    updates: Partial<OAuthClientMetadata>
  ): Promise<OAuthClientInformation | null> {
    const client = await prisma.oAuthClient.findUnique({
      where: { clientId },
    });

    if (!client) {
      return null;
    }

    const data: any = {};

    if (updates.client_name) {
      data.name = updates.client_name;
    }

    if (updates.redirect_uris) {
      data.redirectUris = updates.redirect_uris;
    }

    if (updates.scope) {
      data.scopes = this.oauthService.parseScope(updates.scope);
    }

    if (updates.grant_types) {
      data.grantTypes = updates.grant_types;
    }

    if (updates.response_types) {
      data.responseTypes = updates.response_types;
    }

    const updated = await prisma.oAuthClient.update({
      where: { clientId },
      data,
    });

    return {
      client_id: updated.clientId,
      client_name: updated.name,
      redirect_uris: updated.redirectUris as string[],
      grant_types: updated.grantTypes as string[],
      scopes: updated.scopes as string[],
      token_endpoint_auth_method: updated.tokenEndpointAuthMethod,
      trusted: updated.trusted,
      created_at: updated.createdAt,
      updated_at: updated.updatedAt,
    };
  }

  /**
   * Delete client
   */
  async deleteClient(clientId: string): Promise<boolean> {
    try {
      // Also delete related authorization codes and tokens
      await prisma.$transaction([
        prisma.oAuthAuthorizationCode.deleteMany({
          where: { clientId },
        }),
        prisma.oAuthToken.deleteMany({
          where: { clientId },
        }),
        prisma.oAuthClient.delete({
          where: { clientId },
        }),
      ]);

      return true;
    } catch (error) {
      // Return false on deletion failure, error handled by caller
      return false;
    }
  }

  /**
   * Verify client credentials
   */
  async verifyClientCredentials(
    clientId: string,
    clientSecret: string
  ): Promise<boolean> {
    const client = await this.getClient(clientId);

    if (!client) {
      return false;
    }

    // Public clients don't need to verify secret
    if (client.token_endpoint_auth_method === 'none') {
      return true;
    }

    // Verify secret
    return await this.oauthService.verifyClientCredentials(
      clientId,
      clientSecret,
      client.client_secret || null
    );
  }
}

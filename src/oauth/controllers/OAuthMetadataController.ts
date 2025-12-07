/**
 * OAuth Metadata Controller
 * Handles .well-known metadata endpoints
 */

import { Request, Response } from 'express';
import { OAuthService } from '../services/OAuthService.js';
import { getPublicUrl, getAuthorizationServerUrl } from '../../utils/urlUtils.js';
import { createLogger } from '../../logger/index.js';

export class OAuthMetadataController {
  private oauthService: OAuthService;
  
  // Logger for OAuthMetadataController
  private logger = createLogger('OAuthMetadataController');

  constructor() {
    this.oauthService = new OAuthService();
  }

  /**
   * GET /.well-known/oauth-authorization-server
   * OAuth authorization server metadata (RFC 8414)
   */
  authorizationServerMetadata = async (req: Request, res: Response): Promise<void> => {
    try {
      // Get authorization server public URL
      const authorizationServerUrl = getAuthorizationServerUrl(req);

      // Generate metadata
      const metadata = this.oauthService.generateAuthorizationServerMetadata(authorizationServerUrl);

      // Development environment debug logging
      if (process.env.NODE_ENV === 'development') {
        this.logger.debug({
          issuer: metadata.issuer,
          requestPath: req.path,
          headers: {
            host: req.headers.host,
            'x-forwarded-host': req.headers['x-forwarded-host'],
            'x-forwarded-proto': req.headers['x-forwarded-proto']
          }
        }, 'OAuth authorization server metadata');
      }

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.json(metadata);
    } catch (error) {
      this.logger.error({ error }, 'Authorization server metadata error');
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  };

  /**
   * GET /.well-known/oauth-protected-resource
   * GET /.well-known/oauth-protected-resource/mcp
   * OAuth protected resource metadata (RFC 9728)
   */
  protectedResourceMetadata = async (req: Request, res: Response): Promise<void> => {
    try {
      // Get Gateway URL (Backend URL)
      const gatewayUrl = getPublicUrl(req);

      // Get Authorization Server URL
      const authorizationServerUrl = getAuthorizationServerUrl(req);

      // Generate metadata
      const resourceUrl = gatewayUrl.endsWith('/mcp') ? gatewayUrl : `${gatewayUrl}/mcp`;

      const metadata = this.oauthService.generateProtectedResourceMetadata(
        resourceUrl,
        authorizationServerUrl
      );

      // Development environment debug logging
      if (process.env.NODE_ENV === 'development') {
        this.logger.debug({
          resource: metadata.resource,
          authorization_servers: metadata.authorization_servers,
          requestPath: req.path,
          headers: {
            host: req.headers.host,
            'x-forwarded-host': req.headers['x-forwarded-host'],
            'x-forwarded-proto': req.headers['x-forwarded-proto']
          }
        }, 'OAuth protected resource metadata');
      }

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.json(metadata);
    } catch (error) {
      this.logger.error({ error }, 'Protected resource metadata error');
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  };

  /**
   * Handle OPTIONS request (CORS)
   */
  handleOptions = (req: Request, res: Response): void => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(200).end();
  };
}

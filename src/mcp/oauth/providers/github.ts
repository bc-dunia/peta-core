/**
 * GitHub OAuth Provider Adapter
 *
 * Token URL: https://github.com/login/oauth/access_token
 * Auth Method: Form params (client_id/client_secret in body)
 * Content-Type: application/x-www-form-urlencoded
 * Accept: application/json (required to get JSON response)
 * Returns expires_in: No (classic tokens don't expire)
 * Default expiry: 180 days (15552000 seconds) - conservative estimate
 *
 * Note: GitHub's fine-grained personal access tokens can have expiration,
 * but OAuth app tokens typically don't expire unless revoked.
 */

import type { ExchangeContext, ProviderAdapter, ProviderRequest } from '../types.js';

const ONE_HUNDRED_EIGHTY_DAYS_SECONDS = 180 * 24 * 60 * 60; // 15552000

export const githubAdapter: ProviderAdapter = {
  name: 'github',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  defaultExpiresIn: ONE_HUNDRED_EIGHTY_DAYS_SECONDS,

  buildRequest(ctx: ExchangeContext): ProviderRequest {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: ctx.clientId,
      client_secret: ctx.clientSecret,
      code: ctx.code,
      redirect_uri: ctx.redirectUri,
    });

    return {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params,
    };
  },
};

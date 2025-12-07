import { Request } from 'express';

export function getPublicUrl(req: Request): string {

  // Get protocol and host from request headers
  const protocol = req.headers['x-forwarded-proto'] ||
                   req.protocol ||
                   (process.env.ENABLE_HTTPS === 'true' ? 'https' : 'http');

  const host = req.headers['x-forwarded-host'] ||
               req.headers.host ||
               req.get('host');

  const hostString = Array.isArray(host) ? host[0] : host;

  return `${protocol}://${hostString}/mcp`;
}

export function getAuthorizationServerUrl(req: Request): string {

  const gatewayUrl = getPublicUrl(req);

  // Remove /mcp path if present
  const url = new URL(gatewayUrl);
  if (url.pathname === '/mcp') {
    url.pathname = '';
  }

  return url.toString().replace(/\/$/, ''); // Remove trailing slash
}
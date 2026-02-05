import * as https from 'node:https';
import { IncomingMessage } from 'node:http';

// Cache for the JWT token
let cachedToken: string | null = null;
let tokenExpiry: number | null = null;

interface ConnectivityCredentials {
  clientid: string;
  clientsecret: string;
  url: string; // XSUAA URL
  onpremise_proxy_host: string;
  onpremise_proxy_port: number;
}

/**
 * Parses VCAP_SERVICES to find the connectivity service credentials.
 */
function getConnectivityCredentials(): ConnectivityCredentials | null {
  if (!process.env.VCAP_SERVICES) {
    return null;
  }

  try {
    const services = JSON.parse(process.env.VCAP_SERVICES);
    const connectivityService = services.connectivity?.[0];

    if (!connectivityService) {
      return null;
    }

    const { clientid, clientsecret, url, onpremise_proxy_host, onpremise_proxy_port } =
      connectivityService;

    // console.log('DEBUG: creds extracted', { clientid, url, onpremise_proxy_host });

    return {
      clientid,
      clientsecret,
      url,
      onpremise_proxy_host,
      onpremise_proxy_port: parseInt(String(onpremise_proxy_port), 10),
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[@sentry/node]: Failed to parse VCAP_SERVICES for connectivity credentials', e);
    return null;
  }
}

/**
 * Fetches the JWT token from XSUAA for the connectivity service.
 * Handles caching and token expiration.
 */
export async function getConnectivityToken(): Promise<string | null> {
  const now = Date.now();

  // Return cached token if it's still valid (with 30s buffer)
  if (cachedToken && tokenExpiry && now < tokenExpiry - 30000) {
    return cachedToken;
  }

  const creds = getConnectivityCredentials();
  if (!creds) {
    return null;
  }

  return new Promise(resolve => {
    const tokenUrl = new URL('/oauth/token?grant_type=client_credentials', creds.url);
    const auth = Buffer.from(`${creds.clientid}:${creds.clientsecret}`).toString('base64');

    const req = https.request(
      tokenUrl,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
      (res: IncomingMessage) => {
        let data = '';
        res.on('data', (chunk: any) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const response = JSON.parse(data);
              cachedToken = response.access_token;
              // expires_in is in seconds
              tokenExpiry = now + response.expires_in * 1000;
              resolve(cachedToken);
            } catch (e) {
              // eslint-disable-next-line no-console
              console.error('[@sentry/node]: Failed to parse XSUAA token response', e);
              resolve(null);
            }
          } else {
            // eslint-disable-next-line no-console
            console.error(
              `[@sentry/node]: Failed to fetch XSUAA token. Status: ${res.statusCode}, Body: ${data}`,
            );
            resolve(null);
          }
        });
      },
    );

    req.on('error', (err: any) => {
      // eslint-disable-next-line no-console
      console.error('[@sentry/node]: Error fetching XSUAA token', err);
      resolve(null);
    });

    req.end();
  });
}

/**
 * Returns the proxy settings derived from VCAP_SERVICES.
 */
export function getBtpProxySettings(): { host: string; port: number } | null {
  const creds = getConnectivityCredentials();
  if (creds) {
    return {
      host: creds.onpremise_proxy_host,
      port: creds.onpremise_proxy_port,
    };
  }
  return null;
}

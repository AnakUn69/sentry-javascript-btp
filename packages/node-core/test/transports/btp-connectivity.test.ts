import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as https from 'node:https';
import { EventEmitter } from 'events';
import { getConnectivityToken, getBtpProxySettings } from '../../src/transports/btp-connectivity';

vi.mock('node:https');

describe('btp-connectivity', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('getBtpProxySettings', () => {
    it('returns null if VCAP_SERVICES is missing', () => {
      delete process.env.VCAP_SERVICES;
      expect(getBtpProxySettings()).toBeNull();
    });

    it('returns proxy settings from VCAP_SERVICES', () => {
      process.env.VCAP_SERVICES = JSON.stringify({
        connectivity: [
          {
              clientid: 'cid',
              clientsecret: 'sec',
              url: 'http://uaa',
              onpremise_proxy_host: 'proxy.internal',
              onpremise_proxy_port: '8080',
          },
        ],
      });

      expect(getBtpProxySettings()).toEqual({
        host: 'proxy.internal',
        port: 8080,
      });
    });
  });

  describe('getConnectivityToken', () => {
    it('fetches token from XSUAA', async () => {
      process.env.VCAP_SERVICES = JSON.stringify({
        connectivity: [
          {
              clientid: 'cid',
              clientsecret: 'sec',
              url: 'http://uaa',
              onpremise_proxy_host: 'proxy.internal',
              onpremise_proxy_port: '8080',
          },
        ],
      });

      const mockReq = new EventEmitter();
      const mockRes = new EventEmitter();
      (mockRes as any).statusCode = 200;
      (mockReq as any).end = vi.fn();

      (https.request as any).mockImplementation((url: URL, options: any, cb: any) => {
        cb(mockRes);
        return mockReq;
      });

      const promise = getConnectivityToken();

      mockRes.emit('data', JSON.stringify({ access_token: 'fake-token', expires_in: 3600 }));
      mockRes.emit('end');

      await expect(promise).resolves.toBe('fake-token');
    });
  });
});

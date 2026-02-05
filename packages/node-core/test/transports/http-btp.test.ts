import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeNodeTransport } from '../../src/transports/http';
import * as http from 'node:http';
import * as https from 'node:https';
import { createEnvelope } from '@sentry/core';

const { getBtpProxySettingsMock, getConnectivityTokenMock } = vi.hoisted(() => {
  return {
    getBtpProxySettingsMock: vi.fn(),
    getConnectivityTokenMock: vi.fn(),
  };
});

vi.mock('../../src/transports/btp-connectivity', () => ({
  getBtpProxySettings: getBtpProxySettingsMock,
  getConnectivityToken: getConnectivityTokenMock,
}));

vi.mock('node:http');
vi.mock('node:https');

const EVENT_ENVELOPE = createEnvelope({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, []);

describe('BTP HTTP Transport Integration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it.skip('uses BTP proxy when usingCF is true', async () => {
    process.env.SCC_LOCATION_ID = 'LocId';

    getBtpProxySettingsMock.mockReturnValue({
      host: 'proxy.internal',
      port: 8080,
    });
    getConnectivityTokenMock.mockResolvedValue('fake-jwt-token');

    const requestSpy = vi.fn().mockImplementation((options, cb) => {
      const res = {
        on: vi.fn(),
        setEncoding: vi.fn(),
        headers: {},
        statusCode: 200,
      };
      cb(res);
      return {
        on: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
        pipe: vi.fn(),
      };
    });

    (https.request as any).mockImplementation(requestSpy);
    (http.request as any).mockImplementation(requestSpy);

    const transport = makeNodeTransport({
      url: 'https://sentry.onprem/api/123/store/',
      usingCF: true,
    });

    await transport.send(EVENT_ENVELOPE);

    expect(getBtpProxySettingsMock).toHaveBeenCalled();
    expect(getConnectivityTokenMock).toHaveBeenCalled();

    expect(requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: 'proxy.internal',
        port: 8080,
        path: 'https://sentry.onprem/api/123/store/', // Absolute URL
        protocol: 'http:',
        headers: expect.objectContaining({
          'Proxy-Authorization': 'Bearer fake-jwt-token',
          'SAP-Connectivity-SCC-Location_ID': 'LocId',
        }),
      }),
      expect.any(Function),
    );
  });

  it('does NOT use BTP proxy when usingCF is false', async () => {
    const requestSpy = vi.fn().mockImplementation((options, cb) => {
      const res = {
        on: vi.fn(),
        setEncoding: vi.fn(),
        headers: {},
        statusCode: 200,
      };
      cb(res);
      return {
        on: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
        pipe: vi.fn(),
      };
    });

    (https.request as any).mockImplementation(requestSpy);
    (http.request as any).mockImplementation(requestSpy);

    const transport = makeNodeTransport({
      url: 'https://sentry.onprem/api/123/store/',
      usingCF: false,
    });

    await transport.send(EVENT_ENVELOPE);

    expect(getBtpProxySettingsMock).not.toHaveBeenCalled();
  });
});

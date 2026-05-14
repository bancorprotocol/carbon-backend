import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  BadGatewayException,
  GatewayTimeoutException,
} from '@nestjs/common';
import { PassThrough } from 'node:stream';
import { PreviewProxyController } from './preview-proxy.controller';

type MockRepo = {
  findOneBy: jest.Mock;
};

type MockPreviewService = {
  reconcileStatus: jest.Mock;
};

type MockRequest = {
  method: string;
  originalUrl: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  params: Record<string, string>;
};

class MockResponse extends PassThrough {
  statusCode = 200;
  headers = new Map<string, string>();

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: string): this {
    this.headers.set(name.toLowerCase(), String(value));
    return this;
  }
}

describe('PreviewProxyController', () => {
  let controller: PreviewProxyController;
  let repo: MockRepo;
  let previewService: MockPreviewService;
  let originalFetch: typeof globalThis.fetch;

  const readyRecord = {
    tenderlyId: 'tn-1',
    url: 'http://1.2.3.4:3000',
    deployment: 'ethereum',
    status: 'ready',
  };

  beforeEach(() => {
    repo = {
      findOneBy: jest.fn(),
    };
    // The proxy delegates the readiness gate to PreviewService.reconcileStatus
    // so a still-`creating` record can be promoted on first hit. By default the
    // mock just echoes the record's status back.
    previewService = {
      reconcileStatus: jest.fn(async (record: any) => record.status),
    };
    controller = new PreviewProxyController(repo as any, previewService as any);
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function makeReq(partial: Partial<MockRequest> = {}): MockRequest {
    return {
      method: 'GET',
      originalUrl: '/v1/proxy/tn-1/strategies?page=1',
      headers: {},
      params: { '0': 'strategies' },
      ...partial,
    };
  }

  async function readBody(res: MockResponse): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of res) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  it('throws 404 when tenderly id is unknown', async () => {
    repo.findOneBy.mockResolvedValue(null);
    const req = makeReq();
    const res = new MockResponse();

    await expect(controller.proxy('tn-1', req as any, res as any)).rejects.toThrow(NotFoundException);
    expect(globalThis.fetch).toBe(originalFetch);
  });

  it('throws 503 when preview backend is not ready', async () => {
    repo.findOneBy.mockResolvedValue({ ...readyRecord, status: 'creating' });
    const req = makeReq();
    const res = new MockResponse();

    await expect(controller.proxy('tn-1', req as any, res as any)).rejects.toThrow(ServiceUnavailableException);
    expect(globalThis.fetch).toBe(originalFetch);
  });

  it('lazily promotes a creating record to ready and proceeds when reconcile says it is healthy', async () => {
    const creatingRecord = { ...readyRecord, status: 'creating' };
    repo.findOneBy.mockResolvedValue(creatingRecord);
    previewService.reconcileStatus.mockResolvedValue('ready');
    const fetchMock = jest.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    globalThis.fetch = fetchMock as any;

    const req = makeReq();
    const res = new MockResponse();
    await controller.proxy('tn-1', req as any, res as any);

    expect(previewService.reconcileStatus).toHaveBeenCalledWith(creatingRecord);
    expect(fetchMock).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it('proxies GET request, prefixes upstream path with record.deployment, preserves query, streams response', async () => {
    repo.findOneBy.mockResolvedValue(readyRecord);
    const fetchMock = jest.fn().mockResolvedValue(
      new Response('upstream-data', {
        status: 202,
        headers: {
          'content-type': 'application/json',
          'x-upstream': 'yes',
          connection: 'keep-alive',
          'transfer-encoding': 'chunked',
          'content-length': '13',
        },
      }),
    );
    globalThis.fetch = fetchMock as any;

    const req = makeReq({
      headers: {
        accept: 'application/json',
        host: 'api.example.com',
        connection: 'keep-alive',
      },
    });
    const res = new MockResponse();

    await controller.proxy('tn-1', req as any, res as any);
    const body = await readBody(res);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://1.2.3.4:3000/v1/ethereum/strategies?page=1',
      expect.objectContaining({
        method: 'GET',
        headers: { accept: 'application/json' },
        body: undefined,
      }),
    );
    expect(res.statusCode).toBe(202);
    expect(res.headers.get('x-upstream')).toBe('yes');
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(res.headers.get('connection')).toBeUndefined();
    expect(res.headers.get('transfer-encoding')).toBeUndefined();
    expect(res.headers.get('content-length')).toBeUndefined();
    expect(body).toBe('upstream-data');
  });

  it('uses record.deployment for the upstream prefix regardless of any URL hints', async () => {
    // Even if the originalUrl contains some other deployment-shaped string, the
    // proxy must derive the upstream prefix purely from the DB record so callers
    // can never trick it into pointing at a path the upstream doesn't serve.
    repo.findOneBy.mockResolvedValue({ ...readyRecord, deployment: 'sei' });
    const fetchMock = jest.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    globalThis.fetch = fetchMock as any;

    const req = makeReq({
      originalUrl: '/v1/proxy/tn-1/strategies?page=1',
      params: { '0': 'strategies' },
    });
    const res = new MockResponse();

    await controller.proxy('tn-1', req as any, res as any);

    expect(fetchMock).toHaveBeenCalledWith('http://1.2.3.4:3000/v1/sei/strategies?page=1', expect.any(Object));
  });

  it('proxies POST body as JSON and forwards only allowlisted headers', async () => {
    repo.findOneBy.mockResolvedValue(readyRecord);
    const fetchMock = jest.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    globalThis.fetch = fetchMock as any;

    const req = makeReq({
      method: 'POST',
      originalUrl: '/v1/proxy/tn-1/simulator',
      params: { '0': 'simulator' },
      body: { amount: '10' },
      headers: {
        authorization: 'Bearer token',
        'x-request-id': 'abc',
        host: 'api.example.com',
        'transfer-encoding': 'chunked',
      },
    });
    const res = new MockResponse();

    await controller.proxy('tn-1', req as any, res as any);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://1.2.3.4:3000/v1/ethereum/simulator',
      expect.objectContaining({
        method: 'POST',
        headers: {
          authorization: 'Bearer token',
          'x-request-id': 'abc',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ amount: '10' }),
      }),
    );
  });

  it('rejects path-traversal attempts in the wildcard segment', async () => {
    repo.findOneBy.mockResolvedValue(readyRecord);
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as any;

    const req = makeReq({
      originalUrl: '/v1/proxy/tn-1/../../',
      params: { '0': '../..' },
    });
    const res = new MockResponse();

    await expect(controller.proxy('tn-1', req as any, res as any)).rejects.toThrow(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('strips upstream Set-Cookie and Location headers, and forces security headers', async () => {
    repo.findOneBy.mockResolvedValue(readyRecord);
    const fetchMock = jest.fn().mockResolvedValue(
      new Response('redirected', {
        status: 302,
        headers: {
          'content-type': 'text/html',
          'set-cookie': 'session=evil; Path=/',
          location: 'https://evil.example.com/',
          'content-security-policy': 'default-src *',
          'x-content-type-options': 'sniff-it-please',
        },
      }),
    );
    globalThis.fetch = fetchMock as any;

    const req = makeReq();
    const res = new MockResponse();

    await controller.proxy('tn-1', req as any, res as any);

    expect(res.statusCode).toBe(302);
    expect(res.headers.get('set-cookie')).toBeUndefined();
    expect(res.headers.get('location')).toBeUndefined();
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('maps timeout failures to 504', async () => {
    repo.findOneBy.mockResolvedValue(readyRecord);
    const timeoutError = new Error('timeout');
    timeoutError.name = 'TimeoutError';
    globalThis.fetch = jest.fn().mockRejectedValue(timeoutError) as any;

    const req = makeReq();
    const res = new MockResponse();

    await expect(controller.proxy('tn-1', req as any, res as any)).rejects.toThrow(GatewayTimeoutException);
  });

  it('maps network failures to 502', async () => {
    repo.findOneBy.mockResolvedValue(readyRecord);
    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('network down')) as any;

    const req = makeReq();
    const res = new MockResponse();

    await expect(controller.proxy('tn-1', req as any, res as any)).rejects.toThrow(BadGatewayException);
  });
});

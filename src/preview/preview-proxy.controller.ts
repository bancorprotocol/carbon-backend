import {
  All,
  BadGatewayException,
  BadRequestException,
  Controller,
  GatewayTimeoutException,
  NotFoundException,
  Param,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request, Response } from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { PreviewBackend } from './preview-backend.entity';
import { PreviewService } from './preview.service';

const REQUEST_HEADER_ALLOWLIST = new Set(['accept', 'authorization', 'content-type', 'x-request-id']);
// Headers we never copy from upstream. `set-cookie` and `location` are blocked
// because the proxy response shares an origin with the regular API, so any
// upstream-controlled cookie or redirect would be attached to subsequent
// regular-API requests in the same browser session. `content-security-policy`
// and `x-content-type-options` are blocked so the values we set ourselves below
// can't be weakened by an upstream override.
const RESPONSE_HEADER_BLOCKLIST = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'set-cookie',
  'location',
  'content-security-policy',
  'x-content-type-options',
]);

// Excluded from Swagger because this controller is a forwarder, not part of
// the carbon-backend API surface — the documented surface is whatever the
// upstream preview backend exposes at `/v1/<deployment>/...`.
@ApiExcludeController()
@Controller({ version: '1', path: 'proxy/:tenderlyId' })
export class PreviewProxyController {
  constructor(
    @InjectRepository(PreviewBackend)
    private readonly repo: Repository<PreviewBackend>,
    private readonly previewService: PreviewService,
  ) {}

  // Single wildcard route handles every nested URL under
  // /v1/proxy/:tenderlyId/<...rest>. The deployment (e.g. `ethereum`) is
  // looked up from the DB record rather than taken from the URL — a tenderly
  // vnet is bound to one chain at creation time, so making the caller repeat
  // it would only invite mismatches. The bare URL (no trailing segments)
  // intentionally 404s.
  @All('*')
  async proxy(
    @Param('tenderlyId') tenderlyId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const rest = String((req.params as Record<string, string>)['0'] ?? '');
    await this.proxyRequest(tenderlyId, rest, req, res);
  }

  private async proxyRequest(tenderlyId: string, rest: string, req: Request, res: Response): Promise<void> {
    const record = await this.repo.findOneBy({ tenderlyId });
    if (!record) {
      throw new NotFoundException(`No preview backend found for Tenderly ID ${tenderlyId}`);
    }

    // Lazily promote a still-`creating` record if the VM is actually healthy.
    // Without this, the first proxy hit after a successful create races the
    // 30s reconcile cron and may 503 unnecessarily — the second call would
    // succeed but the first one shouldn't have to fail.
    const status = await this.previewService.reconcileStatus(record);
    if (status !== 'ready') {
      throw new ServiceUnavailableException(`Preview backend ${tenderlyId} is not ready`);
    }

    // Refuse `.`/`..` segments. Otherwise fetch()'s WHATWG URL parsing would
    // collapse them and let a client escape the `/v1/<deployment>/...`
    // namespace — reaching unrelated upstream routes (e.g. Swagger UI HTML
    // at `/`) which would then be served under the API origin. Only the
    // caller-controlled `rest` needs checking; `record.deployment` comes
    // from the DB and is set at creation time from a fixed enum.
    const restSegments = rest.split('/');
    if (restSegments.some((s) => s === '..' || s === '.')) {
      throw new BadRequestException('Invalid proxy path');
    }

    const upstreamSegments = [record.deployment, ...restSegments].filter((s) => s !== '');
    const upstreamPath = '/v1/' + upstreamSegments.join('/');
    const queryIdx = req.originalUrl.indexOf('?');
    const query = queryIdx >= 0 ? req.originalUrl.slice(queryIdx) : '';
    const targetUrl = new URL(upstreamPath + query, record.url).toString();

    const method = req.method.toUpperCase();
    const hasBody = method !== 'GET' && method !== 'HEAD';

    try {
      const upstreamResponse = await fetch(targetUrl, {
        method,
        headers: this.buildRequestHeaders(req.headers, hasBody),
        body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
        signal: AbortSignal.timeout(30_000),
        // Never follow upstream redirects. A hostile/compromised upstream returning
        // `Location: https://evil/` would otherwise cause the proxy to reissue the
        // request — including the caller's allowlisted Authorization header — to an
        // arbitrary URL of the upstream's choosing.
        redirect: 'manual',
      });

      this.copyResponseHeaders(upstreamResponse.headers, res);
      this.applySecurityHeaders(res);
      res.status(upstreamResponse.status);

      if (!upstreamResponse.body) {
        res.end();
        return;
      }

      await pipeline(Readable.fromWeb(upstreamResponse.body as never), res);
    } catch (error: unknown) {
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        throw new GatewayTimeoutException(`Upstream preview request timed out for ${tenderlyId}`);
      }
      throw new BadGatewayException(`Failed to proxy request to preview backend ${tenderlyId}`);
    }
  }

  private buildRequestHeaders(headers: Request['headers'], hasBody: boolean): Record<string, string> {
    const mappedHeaders: Record<string, string> = {};
    for (const [key, rawValue] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (!REQUEST_HEADER_ALLOWLIST.has(lowerKey)) continue;
      if (rawValue === undefined) continue;
      mappedHeaders[lowerKey] = Array.isArray(rawValue) ? rawValue.join(',') : String(rawValue);
    }

    if (hasBody) {
      // Current proxy scope is JSON API endpoints; raw body passthrough can be added if needed.
      mappedHeaders['content-type'] = 'application/json';
    } else {
      delete mappedHeaders['content-type'];
    }

    return mappedHeaders;
  }

  private copyResponseHeaders(headers: Headers, res: Response): void {
    headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (RESPONSE_HEADER_BLOCKLIST.has(lowerKey)) return;
      res.setHeader(key, value);
    });
  }

  // The proxy response shares an origin with the regular API. These headers
  // ensure that even if the upstream returns HTML/SVG/JS (intentionally or via
  // a future bug), the browser refuses to execute it as same-origin script.
  private applySecurityHeaders(res: Response): void {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  }
}

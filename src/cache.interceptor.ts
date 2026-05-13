import { Injectable, ExecutionContext } from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';

@Injectable()
export class SubdomainCacheInterceptor extends CacheInterceptor {
  trackBy(context: ExecutionContext): string | undefined {
    if (process.env.NODE_ENV !== 'production') {
      return undefined;
    }

    // Only GET responses are safe to cache. The base CacheInterceptor enforces
    // this inside its default trackBy() via isRequestCacheable(); when we
    // override trackBy() we must replicate that check ourselves, otherwise
    // POST/PUT/PATCH/DELETE responses get cached too, which causes mutations
    // to silently no-op and return stale prior responses.
    if (!this.isRequestCacheable(context)) {
      return undefined;
    }

    const request = context.switchToHttp().getRequest();
    const url = request.url;

    // Skip caching for notifications controller
    if (url.includes('/notifications')) {
      return undefined;
    }
    if (url.includes('/proxy/')) {
      return undefined;
    }

    const host = request.headers.host || '';
    const subdomain = host.split('.')[0]; // Extract subdomain
    return `${subdomain}-${url}`; // Combine subdomain with URL to create unique cache key
  }
}

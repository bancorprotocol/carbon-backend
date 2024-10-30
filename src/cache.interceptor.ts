import { Injectable, ExecutionContext } from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';

@Injectable()
export class SubdomainCacheInterceptor extends CacheInterceptor {
  trackBy(context: ExecutionContext): string | undefined {
    if (process.env.NODE_ENV !== 'production') {
      return null;
    }

    const request = context.switchToHttp().getRequest();
    const host = request.headers.host || '';
    const subdomain = host.split('.')[0]; // Extract subdomain
    const url = request.url;
    return `${subdomain}-${url}`; // Combine subdomain with URL to create unique cache key
  }
}

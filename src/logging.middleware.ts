import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const controllerPath = req.path.split('/')[2];
    if (!controllerPath) {
      return next();
    }
    const controllerName = controllerPath.charAt(0).toUpperCase() + controllerPath.slice(1) + 'Controller';
    const logger = new Logger(controllerName);
    logger.log(`URL: ${req.url}, Query Parameters: ${JSON.stringify(req.query)}`);
    next();
  }
}

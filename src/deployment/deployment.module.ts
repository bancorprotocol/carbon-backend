import { Module } from '@nestjs/common';
import { DeploymentService } from './deployment.service';

@Module({
  providers: [DeploymentService],
  exports: [DeploymentService],
})
export class DeploymentModule {}

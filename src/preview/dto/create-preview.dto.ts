import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiHideProperty } from '@nestjs/swagger';

export class CreatePreviewDto {
  @ApiHideProperty()
  @IsString()
  @IsNotEmpty()
  tenderlyId: string;

  // For Tenderly forks that have a freshly-deployed GradientController, the
  // dev script (src/scripts/gradient/testnet/create.sh) prints these so the
  // preview backend can be booted with gradient support enabled. Optional
  // because preview backends for non-gradient deployments don't need them.
  @ApiHideProperty()
  @IsOptional()
  @IsString()
  gradientControllerAddress?: string;

  @ApiHideProperty()
  @IsOptional()
  @IsString()
  gradientVoucherAddress?: string;
}

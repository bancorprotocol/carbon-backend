import { IsOptional, IsNumber } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class VolumeDto {
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  @ApiPropertyOptional({
    type: Number,
    description: 'Start timestamp in seconds',
  })
  start?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  @ApiPropertyOptional({
    type: Number,
    description: 'End timestamp in seconds',
  })
  end?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  @ApiPropertyOptional({
    type: Number,
    description: 'Offset for pagination',
  })
  offset?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  @ApiPropertyOptional({
    type: Number,
    description: 'Limit for pagination',
    default: 10000,
  })
  limit?: number;
}

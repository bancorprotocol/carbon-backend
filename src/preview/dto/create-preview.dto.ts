import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePreviewDto {
  @ApiProperty({ description: 'Tenderly Virtual TestNet ID', example: 'd64732df-58d7-48c5-9408-71e77cfe99a4' })
  @IsString()
  @IsNotEmpty()
  tenderlyId: string;
}

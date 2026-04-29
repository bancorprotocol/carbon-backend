import { IsString, IsNotEmpty } from 'class-validator';
import { ApiHideProperty } from '@nestjs/swagger';

export class CreatePreviewDto {
  @ApiHideProperty()
  @IsString()
  @IsNotEmpty()
  tenderlyId: string;
}

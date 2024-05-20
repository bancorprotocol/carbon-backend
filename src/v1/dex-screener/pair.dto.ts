import { IsNumberString } from 'class-validator';

export class PairDto {
  @IsNumberString()
  id: string;
}

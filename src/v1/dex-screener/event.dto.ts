import { IsNumberString } from 'class-validator';

export class EventDto {
  @IsNumberString()
  fromBlock: string;

  @IsNumberString()
  toBlock: string;
}

import { IsNumberString } from 'class-validator';
import { Block } from './latest-block.dto';

export class EventsQueryDto {
  @IsNumberString()
  fromBlock: string;

  @IsNumberString()
  toBlock: string;
}

export interface EventsResponse {
  events: Array<{ block: Block } & (SwapEvent | JoinExitEvent)>;
}

export interface SwapEvent {
  eventType: 'swap';
  txnId: string;
  txnIndex: number;
  eventIndex: number;
  maker: string;
  pairId: string;
  asset0In?: number | string;
  asset1In?: number | string;
  asset0Out?: number | string;
  asset1Out?: number | string;
  priceNative: number | string;
  reserves: {
    asset0: number | string;
    asset1: number | string;
  };
  metadata?: Record<string, string>;
}

export interface JoinExitEvent {
  eventType: 'join' | 'exit';
  txnId: string;
  txnIndex: number;
  eventIndex: number;
  maker: string;
  pairId: string;
  amount0: number | string;
  amount1: number | string;
  reserves: {
    asset0: number | string;
    asset1: number | string;
  };
  metadata?: Record<string, string>;
}

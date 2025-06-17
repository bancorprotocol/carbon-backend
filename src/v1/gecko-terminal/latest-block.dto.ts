export interface LatestBlockResponse {
  block: Block;
}

export interface Block {
  blockNumber: number;
  blockTimestamp: number;
  metadata?: Record<string, string>;
}

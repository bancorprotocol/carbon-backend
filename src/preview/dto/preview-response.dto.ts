import { ApiProperty } from '@nestjs/swagger';

export class PreviewResponseDto {
  @ApiProperty({ example: 'https://carbon-prev-d64732df.fly.dev' })
  url: string;

  @ApiProperty({ enum: ['existing', 'creating', 'seeding', 'ready', 'error'] })
  status: string;

  @ApiProperty({ example: 'ethereum' })
  deployment: string;

  @ApiProperty({ example: 24677999 })
  forkBlock: number;

  @ApiProperty({ example: 24678050, nullable: true })
  currentBlock: number | null;

  @ApiProperty({ example: 'https://rpc.vnet.tenderly.co/...' })
  rpcUrl: string;

  @ApiProperty({ example: '2026-03-23T10:00:00.000Z' })
  createdAt: string;
}

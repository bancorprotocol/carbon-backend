import { ApiHideProperty } from '@nestjs/swagger';

export class PreviewResponseDto {
  @ApiHideProperty()
  url: string;

  @ApiHideProperty()
  status: string;

  @ApiHideProperty()
  deployment: string;

  @ApiHideProperty()
  forkBlock: number;

  @ApiHideProperty()
  currentBlock: number | null;

  @ApiHideProperty()
  rpcUrl: string;

  @ApiHideProperty()
  createdAt: string;
}

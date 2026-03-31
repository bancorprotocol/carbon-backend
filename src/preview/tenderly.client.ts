import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { TENDERLY_API_BASE } from './constants';

export interface TenderlyVnet {
  id: string;
  slug: string;
  display_name: string;
  fork_config: {
    network_id: number;
    block_number: number;
  };
  rpcs: Array<{
    name: string;
    url: string;
  }>;
}

@Injectable()
export class TenderlyClient {
  private readonly logger = new Logger(TenderlyClient.name);
  private readonly http: AxiosInstance;
  private readonly basePath: string;

  constructor(private readonly configService: ConfigService) {
    const accessKey = this.configService.get<string>('TENDERLY_ACCESS_KEY');
    const account =
      this.configService.get<string>('TENDERLY_ACCOUNT_SLUG') || this.configService.get<string>('TENDERLY_USERNAME');
    const project =
      this.configService.get<string>('TENDERLY_PROJECT_SLUG') || this.configService.get<string>('TENDERLY_PROJECT');

    this.basePath = `${TENDERLY_API_BASE}/account/${account}/project/${project}`;

    this.http = axios.create({
      headers: {
        'X-Access-Key': accessKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  async getVnet(tenderlyId: string): Promise<TenderlyVnet | null> {
    try {
      const { data } = await this.http.get(`${this.basePath}/vnets/${tenderlyId}`);
      return data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      this.logger.error(`Failed to get Tenderly vnet ${tenderlyId}: ${error.message}`);
      throw error;
    }
  }

  async listVnets(): Promise<TenderlyVnet[]> {
    try {
      const { data } = await this.http.get(`${this.basePath}/vnets`);
      return Array.isArray(data) ? data : data?.vnets ?? [];
    } catch (error) {
      this.logger.error(`Failed to list Tenderly vnets: ${error.message}`);
      throw error;
    }
  }

  async getCurrentBlock(adminRpcUrl: string): Promise<number> {
    try {
      const { data } = await axios.post(
        adminRpcUrl,
        { jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 },
        { timeout: 10000 },
      );
      return parseInt(data.result, 16);
    } catch (error) {
      this.logger.error(`Failed to get current block from Tenderly RPC: ${error.message}`);
      throw error;
    }
  }

  getAdminRpcUrl(vnet: TenderlyVnet): string | undefined {
    return vnet.rpcs?.find((rpc) => rpc.name === 'Admin RPC')?.url;
  }
}

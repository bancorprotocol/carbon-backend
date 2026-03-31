import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PreviewBackend } from './preview-backend.entity';
import { TenderlyClient } from './tenderly.client';
import { GceProvider } from './gce.client';
import { getNetworkMapping, PREVIEW_APP_PREFIX, PREVIEW_MAX_AGE_HOURS } from './constants';
import { PreviewResponseDto } from './dto/preview-response.dto';

@Injectable()
export class PreviewService {
  private readonly logger = new Logger(PreviewService.name);
  private readonly previewImageUri: string;
  private readonly creatingLocks = new Set<string>();

  constructor(
    @InjectRepository(PreviewBackend)
    private readonly repo: Repository<PreviewBackend>,
    private readonly tenderlyClient: TenderlyClient,
    private readonly gceProvider: GceProvider,
    private readonly configService: ConfigService,
  ) {
    this.previewImageUri =
      this.configService.get<string>('PREVIEW_IMAGE_URI') ||
      'europe-west2-docker.pkg.dev/bancor-api/carbon-multi/carbon-preview:latest';
  }

  async create(tenderlyId: string): Promise<PreviewResponseDto> {
    const existing = await this.repo.findOneBy({ tenderlyId });
    if (existing) {
      const healthy = await this.gceProvider.instanceExists(existing.instanceName);
      if (healthy) {
        return this.toResponse(existing, 'existing');
      }
      await this.repo.remove(existing);
    }

    if (this.creatingLocks.has(tenderlyId)) {
      throw new ConflictException(`Preview for ${tenderlyId} is already being created`);
    }

    this.creatingLocks.add(tenderlyId);
    try {
      return await this.createPreview(tenderlyId);
    } finally {
      this.creatingLocks.delete(tenderlyId);
    }
  }

  private async createPreview(tenderlyId: string): Promise<PreviewResponseDto> {
    const vnet = await this.tenderlyClient.getVnet(tenderlyId);
    if (!vnet) {
      throw new NotFoundException(`Tenderly vnet ${tenderlyId} not found in the organization`);
    }

    const networkId = vnet.fork_config?.network_id;
    const forkBlock = vnet.fork_config?.block_number;
    const mapping = getNetworkMapping(networkId);

    if (!mapping) {
      throw new BadRequestException(
        `Network with chain ID ${networkId} is not supported for preview. Supported: Ethereum (1), Sei (1329), Celo (42220), Coti (2632500)`,
      );
    }

    const adminRpcUrl = this.tenderlyClient.getAdminRpcUrl(vnet);
    if (!adminRpcUrl) {
      throw new BadRequestException('Could not find Admin RPC URL in Tenderly vnet response');
    }

    let currentBlock: number | null = null;
    try {
      currentBlock = await this.tenderlyClient.getCurrentBlock(adminRpcUrl);
    } catch {
      this.logger.warn(`Could not fetch current block for vnet ${tenderlyId}, using fork block`);
    }

    const shortId = tenderlyId.substring(0, 8);
    const instanceName = `${PREVIEW_APP_PREFIX}-${shortId}`;

    const env = this.buildEnvVars(mapping.rpcEnvVar, adminRpcUrl, mapping.exchangeId, forkBlock);
    const { instanceId, url } = await this.gceProvider.createInstance(instanceName, env, this.previewImageUri);

    const record = this.repo.create({
      tenderlyId,
      instanceName,
      instanceId,
      provider: 'gce',
      url,
      deployment: mapping.exchangeId,
      networkId,
      forkBlock,
      currentBlock,
      rpcUrl: adminRpcUrl,
      status: 'creating',
    });
    await this.repo.save(record);

    this.logger.log(
      `Created preview backend: ${instanceName} for vnet ${tenderlyId} (${mapping.name}, fork@${forkBlock})`,
    );

    return this.toResponse(record, 'creating');
  }

  async getStatus(tenderlyId: string): Promise<PreviewResponseDto> {
    const record = await this.repo.findOneBy({ tenderlyId });
    if (!record) {
      throw new NotFoundException(`No preview backend found for Tenderly ID ${tenderlyId}`);
    }

    let status = record.status;
    if (status === 'creating' || status === 'seeding') {
      try {
        const gceStatus = await this.gceProvider.getInstanceStatus(record.instanceName, record.instanceId);

        if (gceStatus === 'RUNNING') {
          const isHealthy = await this.checkHealth(record.url);
          if (isHealthy) {
            status = 'ready';
            await this.repo.update(record.id, { status: 'ready' });
          }
        } else if (gceStatus === 'TERMINATED' || gceStatus === 'STOPPED') {
          status = 'error';
          await this.repo.update(record.id, { status: 'error' });
        }
      } catch {
        // keep current status on transient errors
      }
    }

    return this.toResponse(record, status);
  }

  async delete(tenderlyId: string): Promise<void> {
    const record = await this.repo.findOneBy({ tenderlyId });
    if (!record) {
      throw new NotFoundException(`No preview backend found for Tenderly ID ${tenderlyId}`);
    }

    await this.destroyPreview(record);
    this.logger.log(`Deleted preview backend for vnet ${tenderlyId}`);
  }

  @Cron('*/5 * * * *')
  async cleanup(): Promise<void> {
    const records = await this.repo.find();
    if (records.length === 0) return;

    this.logger.log(`Running cleanup check on ${records.length} preview backend(s)`);

    for (const record of records) {
      try {
        const shouldDestroy = await this.shouldDestroyPreview(record);
        if (shouldDestroy) {
          await this.destroyPreview(record);
        }
      } catch (error) {
        this.logger.error(`Cleanup error for ${record.instanceName}: ${error.message}`);
      }
    }
  }

  private async shouldDestroyPreview(record: PreviewBackend): Promise<boolean> {
    const ageHours = (Date.now() - record.createdAt.getTime()) / (1000 * 60 * 60);
    if (ageHours > PREVIEW_MAX_AGE_HOURS) {
      this.logger.log(`Preview ${record.instanceName} exceeded max age (${ageHours.toFixed(1)}h), destroying`);
      return true;
    }

    const vnet = await this.tenderlyClient.getVnet(record.tenderlyId);
    if (!vnet) {
      this.logger.log(`Tenderly vnet ${record.tenderlyId} no longer exists, destroying ${record.instanceName}`);
      return true;
    }

    return false;
  }

  private async destroyPreview(record: PreviewBackend): Promise<void> {
    try {
      await this.gceProvider.deleteInstance(record.instanceName);
    } catch (error) {
      this.logger.error(`Failed to delete instance ${record.instanceName}: ${error.message}`);
    }
    await this.repo.remove(record);
  }

  private async checkHealth(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      return response.ok;
    } catch {
      return false;
    }
  }

  private buildEnvVars(rpcEnvVar: string, rpcUrl: string, exchangeId: string, forkBlock: number): Record<string, string> {
    const passthrough = [
      'PREVIEW_DB_PASSWORD',
      'EXTERNAL_DATABASE_HOST',
      'EXTERNAL_DATABASE_PORT',
      'EXTERNAL_DATABASE_USERNAME',
      'EXTERNAL_DATABASE_PASSWORD',
      'EXTERNAL_DATABASE_NAME',
      'CODEX_API_KEY',
      'COINGECKO_API_KEY',
      'COINMARKETCAP_API_KEY',
      'DUNE_API_KEY',
    ];

    const env: Record<string, string> = {
      [rpcEnvVar]: rpcUrl,
      PREVIEW_DEPLOYMENT: exchangeId,
      IS_FORK: '1',
      FORK_BLOCK_NUMBER: String(forkBlock),
      SHOULD_HARVEST: '1',
      SHOULD_UPDATE_ANALYTICS: '1',
      SHOULD_POLL_QUOTES: '0',
      SHOULD_POLL_HISTORIC_QUOTES: '0',
      SEND_NOTIFICATIONS: '0',
      NODE_ENV: 'production',
    };

    for (const key of passthrough) {
      const val = this.configService.get<string>(key);
      if (val) env[key] = val;
    }

    return env;
  }

  private toResponse(record: PreviewBackend, statusOverride?: string): PreviewResponseDto {
    return {
      url: record.url,
      status: statusOverride || record.status,
      deployment: record.deployment,
      forkBlock: record.forkBlock,
      currentBlock: record.currentBlock,
      createdAt: record.createdAt.toISOString(),
    };
  }
}

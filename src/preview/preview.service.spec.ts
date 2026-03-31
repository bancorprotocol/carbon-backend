import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PreviewService } from './preview.service';
import { PreviewBackend } from './preview-backend.entity';
import { TenderlyClient } from './tenderly.client';
import { GceProvider } from './gce.client';

describe('PreviewService', () => {
  let service: PreviewService;
  let module: TestingModule;
  let tenderlyClient: jest.Mocked<TenderlyClient>;
  let gceProvider: jest.Mocked<GceProvider>;
  let repo: any;

  const mockVnet = {
    id: 'abc-123-def-456',
    slug: 'test-vnet',
    display_name: 'Test VNet',
    fork_config: { network_id: 1, block_number: 20000000 },
    rpcs: [{ name: 'Admin RPC', url: 'https://admin.rpc.tenderly.co/test' }],
  };

  const mockRecord: Partial<PreviewBackend> = {
    id: 1,
    tenderlyId: 'abc-123-def-456',
    instanceName: 'carbon-prev-abc-123-',
    instanceId: 'instance-1',
    provider: 'gce',
    url: 'http://1.2.3.4:3000',
    deployment: 'ethereum',
    networkId: 1,
    forkBlock: 20000000,
    currentBlock: 20000050,
    rpcUrl: 'https://admin.rpc.tenderly.co/test',
    status: 'creating',
    createdAt: new Date('2026-03-23T10:00:00Z'),
    updatedAt: new Date('2026-03-23T10:00:00Z'),
  };

  beforeEach(async () => {
    const mockRepo = {
      findOneBy: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((data) => ({ ...data, id: 1, createdAt: new Date(), updatedAt: new Date() })),
      save: jest.fn((data) => data),
      update: jest.fn(),
      remove: jest.fn(),
    };

    module = await Test.createTestingModule({
      providers: [
        PreviewService,
        { provide: getRepositoryToken(PreviewBackend), useValue: mockRepo },
        {
          provide: TenderlyClient,
          useValue: {
            getVnet: jest.fn(),
            getCurrentBlock: jest.fn(),
            getAdminRpcUrl: jest.fn(),
            listVnets: jest.fn(),
          },
        },
        {
          provide: GceProvider,
          useValue: {
            createInstance: jest.fn(),
            deleteInstance: jest.fn(),
            instanceExists: jest.fn(),
            getInstanceStatus: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                PREVIEW_IMAGE_URI: 'test-image:latest',
                EXTERNAL_DATABASE_HOST: 'db.example.com',
                EXTERNAL_DATABASE_USERNAME: 'user',
                EXTERNAL_DATABASE_PASSWORD: 'pass',
                EXTERNAL_DATABASE_NAME: 'carbon',
              };
              return config[key] || '';
            }),
          },
        },
      ],
    }).compile();

    service = module.get<PreviewService>(PreviewService);
    tenderlyClient = module.get(TenderlyClient);
    gceProvider = module.get(GceProvider);
    repo = module.get(getRepositoryToken(PreviewBackend));
  });

  afterEach(async () => {
    await module.close();
  });

  describe('create', () => {
    it('should return existing backend if found and healthy', async () => {
      repo.findOneBy.mockResolvedValue(mockRecord);
      gceProvider.instanceExists.mockResolvedValue(true);

      const result = await service.create('abc-123-def-456');
      expect(result.status).toBe('existing');
      expect(result.url).toBe(mockRecord.url);
      expect(tenderlyClient.getVnet).not.toHaveBeenCalled();
    });

    it('should recreate if existing backend is unhealthy', async () => {
      repo.findOneBy.mockResolvedValueOnce(mockRecord).mockResolvedValueOnce(null);
      gceProvider.instanceExists.mockResolvedValue(false);
      tenderlyClient.getVnet.mockResolvedValue(mockVnet);
      tenderlyClient.getAdminRpcUrl.mockReturnValue('https://admin.rpc.tenderly.co/test');
      tenderlyClient.getCurrentBlock.mockResolvedValue(20000050);
      gceProvider.createInstance.mockResolvedValue({ instanceId: 'instance-2', url: 'http://5.6.7.8:3000' });

      const result = await service.create('abc-123-def-456');
      expect(result.status).toBe('creating');
      expect(repo.remove).toHaveBeenCalled();
    });

    it('should throw 404 if Tenderly vnet not found', async () => {
      repo.findOneBy.mockResolvedValue(null);
      tenderlyClient.getVnet.mockResolvedValue(null);

      await expect(service.create('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw 400 for unsupported network', async () => {
      repo.findOneBy.mockResolvedValue(null);
      tenderlyClient.getVnet.mockResolvedValue({
        ...mockVnet,
        fork_config: { network_id: 99999, block_number: 100 },
      });

      await expect(service.create('abc-123-def-456')).rejects.toThrow(BadRequestException);
    });

    it('should create a new preview backend for valid request', async () => {
      repo.findOneBy.mockResolvedValue(null);
      tenderlyClient.getVnet.mockResolvedValue(mockVnet);
      tenderlyClient.getAdminRpcUrl.mockReturnValue('https://admin.rpc.tenderly.co/test');
      tenderlyClient.getCurrentBlock.mockResolvedValue(20000050);
      gceProvider.createInstance.mockResolvedValue({ instanceId: 'instance-1', url: 'http://1.2.3.4:3000' });

      const result = await service.create('abc-123-def-456');

      expect(result.status).toBe('creating');
      expect(result.deployment).toBe('ethereum');
      expect(result.forkBlock).toBe(20000000);
      expect(gceProvider.createInstance).toHaveBeenCalledWith(
        'carbon-prev-abc-123-',
        expect.objectContaining({ PREVIEW_DEPLOYMENT: 'ethereum', IS_FORK: '1' }),
        'test-image:latest',
      );
      expect(repo.save).toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('should throw 404 if no record found', async () => {
      repo.findOneBy.mockResolvedValue(null);
      await expect(service.getStatus('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should return current status', async () => {
      repo.findOneBy.mockResolvedValue({ ...mockRecord, status: 'ready' });

      const result = await service.getStatus('abc-123-def-456');
      expect(result.status).toBe('ready');
    });

    it('should update status to ready when GCE reports RUNNING and health check passes', async () => {
      repo.findOneBy.mockResolvedValue({ ...mockRecord, status: 'creating' });
      gceProvider.getInstanceStatus.mockResolvedValue('RUNNING');
      const originalFetch = globalThis.fetch;
      globalThis.fetch = jest.fn().mockResolvedValue({ ok: true }) as any;

      const result = await service.getStatus('abc-123-def-456');
      expect(result.status).toBe('ready');
      expect(repo.update).toHaveBeenCalledWith(1, { status: 'ready' });

      globalThis.fetch = originalFetch;
    });
  });

  describe('delete', () => {
    it('should throw 404 if no record found', async () => {
      repo.findOneBy.mockResolvedValue(null);
      await expect(service.delete('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should destroy instance and remove DB record', async () => {
      repo.findOneBy.mockResolvedValue(mockRecord);
      gceProvider.deleteInstance.mockResolvedValue(undefined);

      await service.delete('abc-123-def-456');
      expect(gceProvider.deleteInstance).toHaveBeenCalledWith(mockRecord.instanceName);
      expect(repo.remove).toHaveBeenCalledWith(mockRecord);
    });
  });

  describe('cleanup', () => {
    it('should do nothing when no records exist', async () => {
      repo.find.mockResolvedValue([]);
      await service.cleanup();
      expect(tenderlyClient.getVnet).not.toHaveBeenCalled();
    });

    it('should destroy backends whose Tenderly vnets are gone', async () => {
      const record = { ...mockRecord, createdAt: new Date() };
      repo.find.mockResolvedValue([record]);
      tenderlyClient.getVnet.mockResolvedValue(null);
      gceProvider.deleteInstance.mockResolvedValue(undefined);

      await service.cleanup();

      expect(gceProvider.deleteInstance).toHaveBeenCalledWith(record.instanceName);
      expect(repo.remove).toHaveBeenCalled();
    });

    it('should destroy backends older than max age', async () => {
      const oldDate = new Date(Date.now() - 49 * 60 * 60 * 1000);
      const record = { ...mockRecord, createdAt: oldDate };
      repo.find.mockResolvedValue([record]);
      gceProvider.deleteInstance.mockResolvedValue(undefined);

      await service.cleanup();

      expect(gceProvider.deleteInstance).toHaveBeenCalled();
      expect(repo.remove).toHaveBeenCalled();
    });

    it('should keep backends with active vnets within max age', async () => {
      const record = { ...mockRecord, createdAt: new Date() };
      repo.find.mockResolvedValue([record]);
      tenderlyClient.getVnet.mockResolvedValue(mockVnet);

      await service.cleanup();

      expect(gceProvider.deleteInstance).not.toHaveBeenCalled();
    });
  });
});

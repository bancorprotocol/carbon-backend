const mockInsert = jest.fn();
const mockDelete = jest.fn();
const mockGet = jest.fn();
const mockGetFromFamily = jest.fn();
const mockWait = jest.fn();

jest.mock('@google-cloud/compute', () => ({
  InstancesClient: jest.fn().mockImplementation(() => ({
    insert: mockInsert,
    delete: mockDelete,
    get: mockGet,
  })),
  ImagesClient: jest.fn().mockImplementation(() => ({
    getFromFamily: mockGetFromFamily,
  })),
  ZoneOperationsClient: jest.fn().mockImplementation(() => ({
    wait: mockWait,
  })),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GceProvider } from './gce.client';

describe('GceProvider', () => {
  let provider: GceProvider;
  let module: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      providers: [
        GceProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                GCE_PROJECT: 'test-project',
                GCE_ZONE: 'us-central1-a',
                GCE_MACHINE_TYPE: 'e2-small',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    provider = module.get<GceProvider>(GceProvider);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('createInstance', () => {
    it('should create a GCE instance and return url with external IP', async () => {
      mockGetFromFamily.mockResolvedValue([{ selfLink: 'https://compute.googleapis.com/cos-stable-image' }]);
      mockInsert.mockResolvedValue([{ latestResponse: { name: 'op-123' } }]);
      mockWait.mockResolvedValue([{}]);
      mockGet.mockResolvedValue([
        {
          networkInterfaces: [{ accessConfigs: [{ natIP: '34.56.78.90' }] }],
        },
      ]);

      const result = await provider.createInstance(
        'carbon-prev-test1234',
        { NODE_ENV: 'production', IS_FORK: '1' },
        'europe-west2-docker.pkg.dev/bancor-api/carbon-multi/carbon-preview:latest',
      );

      expect(result.url).toBe('http://34.56.78.90:3000');
      expect(result.instanceId).toContain('carbon-prev-test1234');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          project: 'test-project',
          zone: 'us-central1-a',
          instanceResource: expect.objectContaining({
            name: 'carbon-prev-test1234',
          }),
        }),
      );
    });
  });

  describe('deleteInstance', () => {
    it('should delete a GCE instance', async () => {
      mockDelete.mockResolvedValue([{ latestResponse: { name: 'op-456' } }]);
      mockWait.mockResolvedValue([{}]);

      await provider.deleteInstance('carbon-prev-test1234');

      expect(mockDelete).toHaveBeenCalledWith({
        project: 'test-project',
        zone: 'us-central1-a',
        instance: 'carbon-prev-test1234',
      });
    });

    it('should not throw on 404 (already deleted)', async () => {
      mockDelete.mockRejectedValue({ code: 404, message: 'not found' });

      await expect(provider.deleteInstance('carbon-prev-test1234')).resolves.not.toThrow();
    });
  });

  describe('instanceExists', () => {
    it('should return true when instance exists', async () => {
      mockGet.mockResolvedValue([{ status: 'RUNNING' }]);
      expect(await provider.instanceExists('carbon-prev-test1234')).toBe(true);
    });

    it('should return false when instance does not exist', async () => {
      mockGet.mockRejectedValue(new Error('Not found'));
      expect(await provider.instanceExists('carbon-prev-test1234')).toBe(false);
    });
  });

  describe('getInstanceStatus', () => {
    it('should return RUNNING for a running instance', async () => {
      mockGet.mockResolvedValue([{ status: 'RUNNING' }]);
      const status = await provider.getInstanceStatus(
        'carbon-prev-test1234',
        'test-project/us-central1-a/carbon-prev-test1234',
      );
      expect(status).toBe('RUNNING');
    });

    it('should return null for a non-existent instance', async () => {
      mockGet.mockRejectedValue(new Error('Not found'));
      const status = await provider.getInstanceStatus(
        'carbon-prev-test1234',
        'test-project/us-central1-a/carbon-prev-test1234',
      );
      expect(status).toBeNull();
    });
  });
});

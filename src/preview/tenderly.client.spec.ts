import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { TenderlyClient } from './tenderly.client';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('TenderlyClient', () => {
  let client: TenderlyClient;

  const mockVnet = {
    id: 'abc-123',
    slug: 'test-vnet',
    display_name: 'Test VNet',
    fork_config: { network_id: 1, block_number: 20000000 },
    rpcs: [
      { name: 'Admin RPC', url: 'https://virtual.mainnet.rpc.tenderly.co/admin-rpc' },
      { name: 'Public RPC', url: 'https://virtual.mainnet.rpc.tenderly.co/public-rpc' },
    ],
  };

  beforeEach(async () => {
    const mockGet = jest.fn();
    const mockHttpInstance = { get: mockGet, post: jest.fn() };
    mockedAxios.create.mockReturnValue(mockHttpInstance as any);
    mockedAxios.isAxiosError.mockImplementation((err: any) => err?.isAxiosError === true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenderlyClient,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              const config = {
                TENDERLY_ACCESS_KEY: 'test-key',
                TENDERLY_ACCOUNT_SLUG: 'test-account',
                TENDERLY_PROJECT_SLUG: 'test-project',
              };
              return config[key];
            },
          },
        },
      ],
    }).compile();

    client = module.get<TenderlyClient>(TenderlyClient);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getVnet', () => {
    it('should return vnet data on success', async () => {
      const httpInstance = mockedAxios.create.mock.results[0].value;
      httpInstance.get.mockResolvedValue({ data: mockVnet });

      const result = await client.getVnet('abc-123');
      expect(result).toEqual(mockVnet);
      expect(result.fork_config.block_number).toBe(20000000);
      expect(result.fork_config.network_id).toBe(1);
    });

    it('should return null on 404', async () => {
      const httpInstance = mockedAxios.create.mock.results[0].value;
      httpInstance.get.mockRejectedValue({ isAxiosError: true, response: { status: 404 } });

      const result = await client.getVnet('nonexistent');
      expect(result).toBeNull();
    });

    it('should throw on other errors', async () => {
      const httpInstance = mockedAxios.create.mock.results[0].value;
      httpInstance.get.mockRejectedValue(new Error('Network error'));

      await expect(client.getVnet('abc-123')).rejects.toThrow('Network error');
    });
  });

  describe('listVnets', () => {
    it('should return array of vnets', async () => {
      const httpInstance = mockedAxios.create.mock.results[0].value;
      httpInstance.get.mockResolvedValue({ data: [mockVnet] });

      const result = await client.listVnets();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('abc-123');
    });
  });

  describe('getCurrentBlock', () => {
    it('should parse hex block number', async () => {
      mockedAxios.post.mockResolvedValue({ data: { result: '0x1312d00' } });

      const block = await client.getCurrentBlock('https://rpc.example.com');
      expect(block).toBe(20000000);
    });
  });

  describe('getAdminRpcUrl', () => {
    it('should extract Admin RPC URL', () => {
      const url = client.getAdminRpcUrl(mockVnet);
      expect(url).toBe('https://virtual.mainnet.rpc.tenderly.co/admin-rpc');
    });

    it('should return undefined if no Admin RPC', () => {
      const vnet = { ...mockVnet, rpcs: [{ name: 'Public RPC', url: 'https://public.rpc' }] };
      const url = client.getAdminRpcUrl(vnet);
      expect(url).toBeUndefined();
    });
  });
});

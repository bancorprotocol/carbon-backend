/**
 * Integration tests for Tenderly API.
 * Only runs when RUN_INTEGRATION_TESTS=1 is set.
 *
 * Required env vars:
 *   TENDERLY_ACCESS_KEY, TENDERLY_ACCOUNT_SLUG, TENDERLY_PROJECT_SLUG
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TenderlyClient } from './tenderly.client';

const RUN = process.env.RUN_INTEGRATION_TESTS === '1';

(RUN ? describe : describe.skip)('Integration: Tenderly API', () => {
  let client: TenderlyClient;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TenderlyClient, { provide: ConfigService, useValue: { get: (k: string) => process.env[k] } }],
    }).compile();
    client = module.get(TenderlyClient);
  });

  it('should list vnets', async () => {
    const vnets = await client.listVnets();
    expect(Array.isArray(vnets)).toBe(true);
  }, 30000);

  it('should return null for non-existent vnet', async () => {
    const result = await client.getVnet('00000000-0000-0000-0000-000000000000');
    expect(result).toBeNull();
  }, 15000);
});

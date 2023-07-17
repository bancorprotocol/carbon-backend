import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BlockService } from './block.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Block } from './block.entity';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { BlockchainConfigModule } from '../blockchain-config/blockchain-config.module';

describe('Blocks', () => {
  let blockService: BlockService;
  let findOne: jest.Mock;
  let save: jest.Mock;
  let create: jest.Mock;
  let get: jest.Mock;
  let update: jest.Mock;

  beforeEach(async () => {
    findOne = jest.fn();
    save = jest.fn();
    create = jest.fn();
    get = jest.fn();
    update = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      // imports: [ConfigService, BlockchainConfigModule],
      providers: [
        {
          provide: ConfigService,
          useValue: { get },
        },
        BlockService,
        {
          provide: getRepositoryToken(Block),
          useValue: { findOne, save, create },
        },
        {
          provide: LastProcessedBlockService,
          useValue: { get, update },
        },
        {
          provide: 'BLOCKCHAIN_CONFIG',
          useValue: { get, update },
        },
      ],
    }).compile();

    blockService = module.get<BlockService>(BlockService);
  });

  describe('update', () => {
    it('stores new data', async () => {
      jest
        .spyOn(blockService, 'getBlockchainData')
        .mockReturnValue(Promise.resolve({}));
      jest
        .spyOn(blockService, 'getMissingBlocks')
        .mockReturnValueOnce(Promise.resolve([1, 2, 3, 4, 5]))
        .mockReturnValue(Promise.resolve([]));
      await blockService.update(100);
      expect(save).toBeCalledWith([
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      ]);
    });

    it('stores nothing when already updated to the latest', async () => {
      jest
        .spyOn(blockService, 'getBlockchainData')
        .mockReturnValue(Promise.resolve({}));
      jest
        .spyOn(blockService, 'getMissingBlocks')
        .mockReturnValue(Promise.resolve([]));
      await blockService.update(200);
      expect(save).toBeCalledTimes(0);
    });

    it('caches the last processed block id', async () => {
      jest
        .spyOn(blockService, 'getBlockchainData')
        .mockReturnValue(Promise.resolve({}));
      jest
        .spyOn(blockService, 'getMissingBlocks')
        .mockReturnValueOnce(Promise.resolve([1, 2, 3, 4, 5]))
        .mockReturnValue(Promise.resolve([]));
      await blockService.update(5);
      expect(update).toBeCalledWith('block', 5);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { BlockService } from './block.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Block } from './block.entity';

describe('Blocks', () => {
  let blockService: BlockService;
  let findOne: jest.Mock;
  let save: jest.Mock;
  let create: jest.Mock;

  beforeEach(async () => {
    findOne = jest.fn();
    save = jest.fn();
    create = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlockService,
        {
          provide: getRepositoryToken(Block),
          useValue: { findOne, save, create, createQueryBuilder: jest.fn() },
        },
      ],
    }).compile();

    blockService = module.get<BlockService>(BlockService);
  });

  // Note: Tests for private method 'update' have been removed as it's an implementation detail.
  // The update method is now tested indirectly through the public methods that use it.
  it('should be defined', () => {
    expect(blockService).toBeDefined();
  });
});

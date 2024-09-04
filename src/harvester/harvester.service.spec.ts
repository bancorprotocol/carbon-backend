import { Test, TestingModule } from '@nestjs/testing';
import { HarvesterService, ProcessEventsArgs } from './harvester.service';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { LastProcessedBlockService } from '../../last-processed-block/last-processed-block.service';
import { BlockchainConfigModule } from '../..//blockchain-config/blockchain-config.module';
import { RedisModule } from '../../redis/redis.module';
import { Pool } from '../pair/pair.entity';
import { BlockService } from '../../block/block.service';
import { QuoteService } from '../../quote/quote.service';
import { Rate } from '../rate/rate.entity';
import { BnRate } from '../bn-rate/bn-rate.entity';

describe('HarvesterService', () => {
  let service: HarvesterService;
  let get: jest.Mock;
  let getOrInit: jest.Mock;
  let update: jest.Mock;
  let findQuotesForTimestamp: jest.Mock;
  let repository: Repository<unknown>;
  let poolCollectionByPoolForBlock: jest.Mock;
  let processEventsArgs: ProcessEventsArgs;
  const ABI: any = { type: 'event' };

  const eventMock = {
    returnValues: {},
    logIndex: 1,
    transactionIndex: 2,
    transactionHash: '3',
    blockNumber: 10,
    blockHash: '',
    address: '',
    event: '',
    raw: { data: '', topics: [] },
    signature: '',
  };

  const resultMock = {
    block: { id: 10 },
    logIndex: 1,
    transactionIndex: 2,
    transactionHash: '3',
  };

  beforeEach(async () => {
    get = jest.fn();
    getOrInit = jest.fn();
    update = jest.fn();
    poolCollectionByPoolForBlock = jest.fn();
    findQuotesForTimestamp = jest.fn();
    repository = new Repository(Pool, null);
    repository.createQueryBuilder = jest.fn();

    processEventsArgs = {
      entity: '',
      contractName: '',
      eventName: '',
      endBlock: 1000,
      repository,
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [BlockchainConfigModule, RedisModule],
      providers: [
        HarvesterService,
        {
          provide: ConfigService,
          useValue: { get },
        },
        {
          provide: LastProcessedBlockService,
          useValue: { getOrInit, update },
        },
        {
          provide: BlockService,
          useValue: {},
        },
        {
          provide: QuoteService,
          useValue: { findQuotesForTimestamp },
        },
      ],
    }).compile();

    service = module.get<HarvesterService>(HarvesterService);
    service.preClear = jest.fn();
  });

  describe('processEvents', () => {
    it('parses basic AND custom fields', async () => {
      jest.spyOn(repository, 'create').mockImplementation((fields) => fields);
      jest.spyOn(repository, 'save').mockImplementation();
      jest.spyOn(service, 'fetchEventsFromBlockchain').mockResolvedValue([
        {
          ...eventMock,
          returnValues: {
            foo: 'bar',
            bar: 'foo',
            pool: 'xxx',
          },
        },
      ]);

      const pool = new Pool();
      pool.id = 1;
      await service.processEvents({
        ...processEventsArgs,
        fields: ['foo', 'bar'],
        poolsByAddress: { xxx: pool },
      });
      const expected = [
        {
          ...resultMock,
          pool: { id: 1 },
          foo: 'bar',
          bar: 'foo',
        },
      ];
      expect(repository.save).toHaveBeenCalledWith(expected);
    });

    it('parses entities', async () => {
      jest.spyOn(repository, 'create').mockImplementation((fields) => fields);
      jest.spyOn(repository, 'save').mockImplementation();
      jest.spyOn(service, 'fetchEventsFromBlockchain').mockResolvedValue([
        {
          ...eventMock,
          returnValues: {
            pool: 'pool1',
            poolType: 2,
            poolCollection: 'poolCollection1',
            prevPoolCollection: 'poolCollection2',
            newPoolCollection: 'poolCollection3',
          },
        },
      ]);

      const poolsByAddress: any = {
        pool1: {
          id: 1,
          poolType: 2,
          poolCollection: { id: 3 },
          prevPoolCollection: { id: 4 },
          newPoolCollection: { id: 5 },
        },
      };
      const poolCollectionsByAddress: any = {
        poolCollection1: { id: 1 },
        poolCollection2: { id: 2 },
        poolCollection3: { id: 3 },
      };

      await service.processEvents({
        ...processEventsArgs,
        poolsByAddress,
        poolCollectionsByAddress,
      });

      const expected = [
        {
          ...resultMock,
          pool: {
            id: 1,
            newPoolCollection: {
              id: 5,
            },
            poolCollection: {
              id: 3,
            },
            poolType: 2,
            prevPoolCollection: {
              id: 4,
            },
          },

          poolType: 2,
          poolCollection: { id: 1 },
          prevPoolCollection: { id: 2 },
          newPoolCollection: { id: 3 },
        },
      ];
      expect(repository.save).toHaveBeenCalledWith(expected);
    });

    it('updates last processed block', async () => {
      jest.spyOn(repository, 'create').mockImplementation((fields) => fields);
      jest.spyOn(repository, 'save').mockImplementation();
      jest.spyOn(service, 'fetchEventsFromBlockchain').mockResolvedValue([]);
      await service.processEvents(processEventsArgs);
      expect(update).toHaveBeenCalledWith('', 1000);
    });

    it('parses constants', async () => {
      jest.spyOn(repository, 'create').mockImplementation((fields) => fields);
      jest.spyOn(repository, 'save').mockImplementation();
      jest.spyOn(service, 'fetchEventsFromBlockchain').mockResolvedValue([eventMock]);
      await service.processEvents({
        ...processEventsArgs,
        constants: [{ key: 'foo', value: 'bar' }],
      });
      const expected = [
        {
          ...resultMock,
          foo: 'bar',
        },
      ];
      expect(repository.save).toHaveBeenCalledWith(expected);
    });

    it('tags poolCollection', async () => {
      jest.spyOn(repository, 'create').mockImplementation((fields) => fields);
      jest.spyOn(repository, 'save').mockImplementation();
      jest.spyOn(service, 'fetchEventsFromBlockchain').mockResolvedValue([
        {
          ...eventMock,
          returnValues: {
            pool: 'pool1',
          },
        },
      ]);
      const poolsByAddress: any = {
        pool1: {
          id: 1,
          poolCollection: { id: 1 },
        },
      };
      poolCollectionByPoolForBlock.mockReturnValue({ id: 1 });
      await service.processEvents({
        ...processEventsArgs,
        poolsByAddress,
        tagPoolCollection: true,
        poolCollectionByPoolForBlock,
      });
      const expected = [
        {
          ...resultMock,
          poolCollection: { id: 1 },
          pool: {
            id: 1,
            poolCollection: { id: 1 },
          },
        },
      ];
      expect(repository.save).toHaveBeenCalledWith(expected);
    });

    it("normalizes amounts by the event's pool", async () => {
      jest.spyOn(repository, 'create').mockImplementation((fields) => fields);
      jest.spyOn(repository, 'save').mockImplementation();
      jest.spyOn(service, 'fetchEventsFromBlockchain').mockResolvedValue([
        {
          ...eventMock,
          returnValues: {
            pool: 'pool',
            foo: '10',
          },
        },
      ]);

      const poolsByAddress: any = {
        pool: {
          id: 1,
          decimals: 2,
        },
      };

      await service.processEvents({
        ...processEventsArgs,
        poolsByAddress,
        fields: ['foo'],
        normalizeFields: ['foo'],
      });
      const expected = [
        {
          ...resultMock,
          foo: '0.10',
          pool: {
            id: 1,
            decimals: 2,
          },
        },
      ];
      expect(repository.save).toHaveBeenCalledWith(expected);
    });

    it('normalizes amounts using a source map', async () => {
      jest.spyOn(repository, 'create').mockImplementation((fields) => fields);
      jest.spyOn(repository, 'save').mockImplementation();
      jest.spyOn(service, 'fetchEventsFromBlockchain').mockResolvedValue([
        {
          ...eventMock,
          returnValues: {
            foo: '10',
            sourceField: 'pool',
          },
        },
      ]);

      const poolsByAddress: any = {
        pool: {
          id: 1,
          decimals: 2,
        },
      };

      await service.processEvents({
        ...processEventsArgs,
        fields: ['foo', 'sourceField'],
        normalizeFields: ['foo'],
        normalizeFieldsSourceMap: { foo: 'sourceField' },
        poolsByAddress,
      });
      const expected = [
        {
          ...resultMock,
          sourceField: 'pool',
          foo: '0.10',
        },
      ];
      expect(repository.save).toHaveBeenCalledWith(expected);
    });

    it('normalizes amounts using a provided constants', async () => {
      jest.spyOn(repository, 'create').mockImplementation((fields) => fields);
      jest.spyOn(repository, 'save').mockImplementation();
      jest.spyOn(service, 'fetchEventsFromBlockchain').mockResolvedValue([
        {
          ...eventMock,
          returnValues: {
            foo: '10',
            sourceField: 'pool',
          },
        },
      ]);

      await service.processEvents({
        ...processEventsArgs,
        fields: ['foo'],
        normalizeFields: ['foo'],
        normalizeFieldsConstants: { foo: 2 },
      });
      const expected = [
        {
          ...resultMock,
          foo: '0.10',
        },
      ];
      expect(repository.save).toHaveBeenCalledWith(expected);
    });

    it('symbolizes a bnt field', async () => {
      get.mockReturnValue(JSON.stringify([{ symbol: 'bnt', decimals: 2 }]));
      jest.spyOn(repository, 'create').mockImplementation((fields) => fields);
      jest.spyOn(repository, 'save').mockImplementation();
      jest.spyOn(service, 'fetchEventsFromBlockchain').mockResolvedValue([
        {
          ...eventMock,
          returnValues: {
            pool: 'pool',
            bnt: '1000',
          },
        },
      ]);

      const poolsByAddress: any = {
        pool: {
          id: 2,
          poolCollection: { id: 1 },
          decimals: 18,
        },
      };

      const blocksDictionary = {
        10: new Date(1),
      };

      findQuotesForTimestamp.mockReturnValue({
        bnt: new Date(1),
      });

      await service.processEvents({
        ...processEventsArgs,
        symbolize: [{ field: 'bnt', saveAs: 'boo' }],
        fields: ['bnt'],
        normalizeFields: ['bnt'],
        poolsByAddress,
        blocksDictionary,
      });
      const expected = [
        {
          ...resultMock,
          bnt: '0.000000000000001000',
          boo_bnt: '0.000000000000001000',
          pool: { id: 2, decimals: 18, poolCollection: { id: 1 } },
        },
      ];
      expect(repository.save).toHaveBeenCalledWith(expected);
    });

    it('symbolizes using rates', async () => {
      get.mockReturnValue(JSON.stringify([{ symbol: 'bnt', decimals: 2 }]));
      jest.spyOn(repository, 'create').mockImplementation((fields) => fields);
      jest.spyOn(repository, 'save').mockImplementation();
      jest.spyOn(service, 'fetchEventsFromBlockchain').mockResolvedValue([
        {
          ...eventMock,
          returnValues: {
            pool: 'pool',
            foo: '5',
          },
        },
      ]);

      const poolsByAddress: any = {
        pool: {
          id: 2,
          poolCollection: { id: 1 },
          decimals: 18,
        },
      };

      const blocksDictionary = {
        10: new Date(1),
      };

      findQuotesForTimestamp.mockReturnValue({
        bnt: new Date(1),
      });

      await service.processEvents({
        ...processEventsArgs,
        symbolize: [{ field: 'foo', saveAs: 'foo' }],
        symbolizeWithRates: { 2: { 10: <Rate>{ bnt: '8.5' } } },
        fields: ['foo'],
        normalizeFields: ['foo'],
        poolsByAddress,
        blocksDictionary,
      });
      const expected = [
        {
          ...resultMock,
          foo: '0.000000000000000005',
          foo_bnt: '0.000000000000000043',
          pool: { id: 2, decimals: 18, poolCollection: { id: 1 } },
        },
      ];
      expect(repository.save).toHaveBeenCalledWith(expected);
    });

    it('symbolizes using bn rates', async () => {
      get.mockReturnValue(JSON.stringify([{ symbol: 'bnt', decimals: 2 }]));
      jest.spyOn(repository, 'create').mockImplementation((fields) => fields);
      jest.spyOn(repository, 'save').mockImplementation();
      jest.spyOn(service, 'fetchEventsFromBlockchain').mockResolvedValue([
        {
          ...eventMock,
          returnValues: {
            pool: 'pool',
            poolToken: 'pooToken',
            foo: '5',
          },
        },
      ]);

      const poolsByAddress: any = {
        pool: {
          id: 2,
          poolCollection: { id: 1 },
          decimals: 18,
        },
      };

      const blocksDictionary = {
        10: new Date(1),
      };

      findQuotesForTimestamp.mockReturnValue({
        bnt: new Date(1),
      });

      await service.processEvents({
        ...processEventsArgs,
        symbolize: [{ field: 'foo', saveAs: 'foo' }],
        symbolizeWithBnRates: { 2: { 10: <BnRate>{ bnt: '8.5', tkn: '2.2' } } },
        fields: ['foo'],
        normalizeFields: ['foo'],
        poolsByAddress,
        blocksDictionary,
      });
      const expected = [
        {
          ...resultMock,
          foo: '0.000000000000000005',
          foo_bnt: '0.000000000000000094',
          pool: { id: 2, decimals: 18, poolCollection: { id: 1 } },
        },
      ];
      expect(repository.save).toHaveBeenCalledWith(expected);
    });
  });
});

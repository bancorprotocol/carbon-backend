import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import moment from 'moment';
import { RedisModule } from '../redis/redis.module';
import { CoinMarketCapService } from './coin-market-cap/coin-market-cap.service';
import { CryptoCompareService } from './crypto-compare/crypto-compare.service';
import { Quote } from './quote.entity';
import { QuoteService } from './quote.service';
import { Quotes_1Minute } from './quotes.1-minute.entity';

const quoteFactory: Quote = {
  id: 1,
  price: '1',
  timestamp: new Date(),
  symbol: 'usd',
  createdAt: new Date(),
  updatedAt: new Date(),
  provider: 'provider',
};

describe('QuoteService', () => {
  let service: QuoteService;
  let get: jest.Mock;
  let fetchLatest: jest.Mock;
  let save: jest.Mock;
  let create: jest.Mock;
  let fetch: jest.Mock;

  beforeEach(async () => {
    fetchLatest = jest.fn();
    get = jest.fn();
    save = jest.fn();
    create = jest.fn();
    fetch = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      imports: [RedisModule],
      providers: [
        QuoteService,
        { provide: ConfigService, useValue: { get } },
        { provide: CoinMarketCapService, useValue: { fetchLatest } },
        { provide: CryptoCompareService, useValue: { fetch } },
        {
          provide: getRepositoryToken(Quote),
          useValue: { save, create },
        },
        {
          provide: getRepositoryToken(Quotes_1Minute),
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<QuoteService>(QuoteService);
  });

  describe('update', () => {
    it('seeds when db is empty', async () => {
      jest.spyOn(service, 'getLatestQuotes').mockReturnValue(Promise.resolve([]));
      jest.spyOn(service, 'fillHistory').mockReturnValue(Promise.resolve());
      await service.update(new Date());
      expect(service.fillHistory).toBeCalled();
    });

    it('uses historical apis if gap is > 15 minutes', async () => {
      const aTime = moment().subtract('16', 'minutes');
      jest
        .spyOn(service, 'getLatestQuotes')
        .mockReturnValue(Promise.resolve([{ ...quoteFactory, timestamp: aTime.toDate(), symbol: 'usd' }]));
      jest.spyOn(service, 'fillHistory').mockReturnValue(Promise.resolve());
      jest.spyOn(service, 'updateCache').mockReturnValue(Promise.resolve());
      await service.update(new Date());
      expect(service.fillHistory).toBeCalledTimes(1);
      expect(service.updateCache).toBeCalledTimes(1);
    });
  });

  describe('pollForUpdates', () => {
    it('avoids duplicates', async () => {
      const aTime = moment();
      get.mockReturnValueOnce(`[{"symbol": "usd", "decimals": 6}]`);
      jest
        .spyOn(service, 'getLatestQuotes')
        .mockReturnValue(Promise.resolve([{ ...quoteFactory, timestamp: aTime.toDate(), symbol: 'usd' }]));

      fetchLatest.mockReturnValueOnce(
        Promise.resolve({
          usd: {
            price: '6602.60701122',
            timestamp: aTime.subtract(10, 'minute').toISOString(),
          },
        }),
      );

      await service.pollForUpdates();
      expect(save).toBeCalledTimes(0);
    });

    it('saves new quotes', async () => {
      const aTime = moment();
      get.mockReturnValueOnce(`[{"symbol": "usd", "decimals": 6}]`);
      jest
        .spyOn(service, 'getLatestQuotes')
        .mockReturnValue(Promise.resolve([{ ...quoteFactory, timestamp: aTime.toDate() }]));
      jest.spyOn(service, 'updateCache').mockReturnValue(Promise.resolve());

      fetchLatest.mockReturnValueOnce(
        Promise.resolve({
          usd: {
            price: '6602.60701122',
            last_updated: aTime.add(1, 'minute').toISOString(),
          },
        }),
      );

      await service.pollForUpdates();
      expect(save).toBeCalledTimes(1);
    });

    it('avoids polling when db is empty', async () => {
      jest.spyOn(service, 'getLatestQuotes').mockReturnValue(Promise.resolve([]));
      await service.pollForUpdates();
      expect(save).toBeCalledTimes(0);
    });

    it('avoids polling if the gap is > 15 minutes', async () => {
      const aTime = moment().subtract('16', 'minutes');
      jest
        .spyOn(service, 'getLatestQuotes')
        .mockReturnValue(Promise.resolve([{ ...quoteFactory, timestamp: aTime.toDate(), symbol: 'usd' }]));

      fetchLatest.mockReturnValueOnce(
        Promise.resolve({
          usd: {
            price: '6602.60701122',
            last_updated: aTime.toISOString(),
          },
        }),
      );

      await service.pollForUpdates();
      expect(save).toBeCalledTimes(0);
    });
  });
});

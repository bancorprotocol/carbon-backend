import { Controller } from '@nestjs/common';

@Controller()
export class PairController {}

// import { Controller, Get, Header, Query } from '@nestjs/common';
// import { IndexDto } from './index.dto';
// import { CacheService, GlobalCacheKeys } from '../cache/cache.service';
// import { TokensTradedCacheKeys } from '../tokens-traded-event/tokens-traded-event.service';
// import { TotalLiquidityCacheKeys } from '../total-liquidity-updated-event/total-liquidity-updated-event.service';
// import { TradingFeePPMUpdatedEventCacheKeys } from '../trading-fee-ppm-updated-event/trading-fee-ppm-updated-event.service';
// import { TradingLiquidityCacheKeys } from '../trading-liquidity-updated-event/trading-liquidity-updated-event.service';
// import { PoolService } from './pool.service';
// import { Pool } from './pair.entity';
// import { StandardRewardsClaimedCacheKeys } from '../standard-rewards-claimed-event/standard-rewards-claimed-event.service';
// import { StandardRewardsProgramsCacheKeys } from '../standard-rewards-program/standard-rewards-program.service';
// import { StandardRewardsProviderJoinedCacheKeys } from '../standard-rewards-provider-joined-event/standard-rewards-provider-joined.service';
// import { StandardRewardsProviderLeftCacheKeys } from '../standard-rewards-provider-left-event/standard-rewards-provider-left.service';
// import { TradingEnabledEventCacheKeys } from '../trading-enabled-event/trading-enabled-event.service';
// import { DepositingEnabledEventCacheKeys } from '../depositing-enabled-event/depositing-enabled-event.service';
// import {
//   AcrProgramsCacheKeys,
//   AcrProgramService,
// } from '../acr-program/acr-program.service';
// @Controller({
//   host: process.env.V3_HOST || '',
//   path: process.env.V3_HOST ? 'pools' : 'v3/pools',
// })
// export class PoolController {
//   constructor(
//     private poolService: PoolService,
//     private cacheService: CacheService,
//     private acrProgramService: AcrProgramService,
//   ) {}

//   @Get()
//   @Header('Cache-Control', 'public, max-age=10')
//   async index(@Query() params: IndexDto): Promise<any> {
//     try {
//       let result = { index: -1, pools: [] };
//       let pools: Pool[];

//       if (params.dlt_id) {
//         const pool = await this.poolService.byAddress(params.dlt_id);
//         if (!pool) {
//           return {
//             error: {
//               status: 400,
//               messages: [
//                 `Could not find a pool for the specified 'dlt_id'. [dlt_id: ${params.dlt_id}] `,
//               ],
//             },
//           };
//         }
//         pools = [pool];
//       } else {
//         pools = await this.poolService.allWithoutBnt();
//       }

//       pools.forEach((p, i) => {
//         result.pools.push({
//           poolDltId: p.address,
//           poolTokenDltId: p.poolToken.address,
//           name: p.symbol,
//           decimals: p.decimals,
//         });
//         const acrProgram = p.acrPrograms[p.acrPrograms.length - 1];
//         if (acrProgram) {
//           const isActive = this.acrProgramService.isActive(acrProgram);
//           result.pools[i]['autoCompoundingRewardsActive'] = isActive;
//         } else {
//           result.pools[i]['autoCompoundingRewardsActive'] = false;
//         }
//       });

//       const pipe = await this.cacheService.getPipe();
//       const symbols = await this.cacheService.getSymbols(true);
//       const symbolsWithoutTkn = await this.cacheService.getSymbols(false);
//       await this.cacheService.getValuesByPool({
//         pools,
//         pipe,
//         keys: [
//           TradingLiquidityCacheKeys.latestBNT,
//           TradingLiquidityCacheKeys.latestTKN,
//           TokensTradedCacheKeys.volume24h,
//           TokensTradedCacheKeys.fees24h,
//           TotalLiquidityCacheKeys.latestStakedBalance,
//           StandardRewardsClaimedCacheKeys.amount24h,
//           StandardRewardsProviderJoinedCacheKeys.amount,
//           StandardRewardsProviderLeftCacheKeys.amount,
//           StandardRewardsProgramsCacheKeys.latestProgramStakedAmount,
//           TotalLiquidityCacheKeys.latestLiquidity,
//           TokensTradedCacheKeys.volume24hTarget,
//           TokensTradedCacheKeys.volume7d,
//           TokensTradedCacheKeys.volume7dTarget,
//           TokensTradedCacheKeys.fees7d,
//           AcrProgramsCacheKeys.acrFlat24h,
//           AcrProgramsCacheKeys.acrFlat7d,
//           AcrProgramsCacheKeys.acrExpDecay24h,
//           AcrProgramsCacheKeys.acrExpDecay7d,
//         ],
//         symbolize: true,
//         includeTkn: true,
//       });

//       await this.cacheService.getValuesByPool({
//         pools,
//         pipe,
//         keys: [
//           TokensTradedCacheKeys.networkFees24h,
//           TokensTradedCacheKeys.networkFees24hAgo,
//           TokensTradedCacheKeys.networkFees7d,
//         ],
//         symbolize: true,
//         includeTkn: false,
//       });

//       await this.cacheService.getValuesByPool({
//         pools,
//         pipe,
//         keys: [
//           TradingFeePPMUpdatedEventCacheKeys.latest,
//           TradingEnabledEventCacheKeys.latest,
//           DepositingEnabledEventCacheKeys.latest,
//         ],
//       });

//       await this.cacheService.getValues({
//         pipe,
//         keys: [GlobalCacheKeys.lastProcessedBlock],
//       });

//       const data = await pipe.exec();

//       result = this.cacheService.populateSymbolsByPool(
//         result,
//         pools,
//         data,
//         symbols,
//         [
//           'tradingLiquidityBNT',
//           'tradingLiquidityTKN',
//           'volume24h',
//           'fees24h',
//           'stakedBalance',
//           'standardRewardsClaimed24h',
//           'standardRewardsProviderJoined',
//           'standardRewardsProviderLeft',
//           'standardRewardsStaked',
//           'liquidity',
//           'volume24hTarget',
//           'volume7d',
//           'volume7dTarget',
//           'fees7d',
//           'flatAutoCompoundingRewards24h',
//           'flatAutoCompoundingRewards7d',
//           'expDecayAutoCompoundingRewards24h',
//           'expDecayAutoCompoundingRewards7d',
//         ],
//       );

//       result = this.cacheService.populateSymbolsByPool(
//         result,
//         pools,
//         data,
//         symbolsWithoutTkn,
//         ['networkFees24h', 'networkFees24hAgo', 'networkFees7d'],
//       );

//       result = this.cacheService.populateFieldsByPool(result, pools, data, [
//         'tradingFeePPM',
//         'tradingEnabled',
//         'depositingEnabled',
//       ]);

//       result = this.cacheService.populateFields(result, data, null, [
//         GlobalCacheKeys.lastProcessedBlock,
//       ]);
//       const lastBlock = JSON.parse(data[result.index][1]);

//       const zeroValues = {};
//       symbols.forEach((s) => (zeroValues[s.symbol] = '0'));

//       result.pools.forEach((p) => {
//         [
//           'expDecayAutoCompoundingRewards',
//           'flatAutoCompoundingRewards',
//         ].forEach((data) => {
//           const field24h = `${data}24h`;
//           const field7d = `${data}7d`;
//           if (p[field24h]['bnt'] !== '0' && p[field24h]['bnt'] !== 'NaN') {
//             p['autoCompoundingRewards24h'] = p[field24h];
//             p['autoCompoundingRewards7d'] = p[field7d];
//           } else {
//             p['autoCompoundingRewards24h'] = zeroValues;
//             p['autoCompoundingRewards7d'] = zeroValues;
//           }
//           delete p[field24h];
//           delete p[field7d];
//         });
//       });

//       if (params.dlt_id) {
//         return {
//           data: result.pools[0],
//           timestamp: {
//             ethereum: {
//               block: lastBlock.number,
//               timestamp: lastBlock.timestamp / 1000,
//             },
//           },
//         };
//       } else {
//         result.pools.forEach((p) => {
//           p.tradingEnabled = p.tradingEnabled === 'true' ? true : false;
//           p.depositingEnabled = p.depositingEnabled === 'true' ? true : false;
//         });

//         return {
//           data: result.pools,
//           timestamp: {
//             ethereum: {
//               block: lastBlock.number,
//               timestamp: lastBlock.timestamp / 1000,
//             },
//           },
//         };
//       }
//     } catch (error) {
//       console.log(error);
//       return { error: `${error}` };
//     }
//   }
// }

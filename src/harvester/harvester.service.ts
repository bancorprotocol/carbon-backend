import { Injectable } from '@nestjs/common';
import Web3 from 'web3';
import * as _ from 'lodash';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { Repository } from 'typeorm';
import { PairsDictionary } from '../pair/pair.service';
import { BlockService, BlocksDictionary } from '../block/block.service';
import { Quote } from '../quote/quote.entity';
import { ERC20 } from '../abis/erc20.abi';
import { CarbonController } from '../abis/CarbonController.abi';
import { CarbonPOL } from '../abis/CarbonPOL.abi';
import { CarbonVortex } from '../abis/CarbonVortex.abi';
import { CarbonVoucher } from '../abis/CarbonVoucher.abi';
import { BancorArbitrage } from '../abis/BancorArbitrage.abi';
import moment from 'moment';
import { MulticallAbiEthereum } from '../abis/multicall.abi';
import { multicallAbiSei } from '../abis/multicall.abi';
import { hexToString } from 'web3-utils';
import { TokensByAddress } from '../token/token.service';
import { BigNumber } from '@ethersproject/bignumber';
import { BlockchainType, Deployment } from '../deployment/deployment.service';
import { ConfigService } from '@nestjs/config';
import { sleep } from '../utilities';
import { LiquidityProtectionStore } from '../abis/LiquidityProtectionStore.abi';
export const VERSIONS = {
  // PoolMigrator: [{ terminatesAt: 14830503, version: 1 }, { version: 2 }],
};

export enum ContractsNames {
  ERC20 = 'ERC20',
  CarbonController = 'CarbonController',
  CarbonPOL = 'CarbonPOL',
  CarbonVortex = 'CarbonVortex',
  CarbonVoucher = 'CarbonVoucher',
  BancorArbitrage = 'BancorArbitrage',
  LiquidityProtectionStore = 'LiquidityProtectionStore',
}

const Contracts = {
  [ContractsNames.ERC20]: ERC20,
  [ContractsNames.CarbonController]: CarbonController,
  [ContractsNames.CarbonPOL]: CarbonPOL,
  [ContractsNames.CarbonVortex]: CarbonVortex,
  [ContractsNames.CarbonVoucher]: CarbonVoucher,
  [ContractsNames.BancorArbitrage]: BancorArbitrage,
  [ContractsNames.LiquidityProtectionStore]: LiquidityProtectionStore,
};

export interface ConstantField {
  key: string;
  value: any;
}
interface SourceMapItem {
  key: string;
  eventKey: string;
  isRelation?: boolean;
}
export interface ProcessEventsArgs {
  entity: string;
  contractAddress?: string;
  contractName?: ContractsNames;
  eventName: string;
  endBlock: number;
  repository: Repository<unknown>;
  deployment: Deployment;
  stringFields?: string[];
  numberFields?: string[];
  bigNumberFields?: string[];
  booleanFields?: string[];
  constants?: ConstantField[];
  pairsDictionary?: PairsDictionary;
  normalizeFields?: string[];
  normalizeFieldsSourceMap?: NormalizeFieldsSourceMap;
  normalizeFieldsConstants?: NormalizeFieldsConstants;
  tagTimestampFromBlock?: boolean;
  symbolize?: Symbolize[];
  allQuotes?: Quote[];
  customFns?: CustomFn[];
  customData?: any;
  skipLastProcessedBlockUpdate?: boolean;
  findQuotesForTimestamp?: AnyFunc;
  symbolizeIncludeTkn?: boolean;
  dateFields?: string[];
  sourceMap?: SourceMapItem[];
  skipPreClearing?: boolean;
  terminatesAt?: number;
  startAtBlock?: number;
  tokens?: TokensByAddress;
  fetchCallerId?: boolean;
}
export interface NormalizeFieldsSourceMap {
  [field: string]: string;
}
export interface NormalizeFieldsConstants {
  [field: string]: number;
}
export interface Symbolize {
  field: string;
  saveAs: string;
}

export type CustomFn = (args: CustomFnArgs) => Promise<any>;

export const ContractNames = {
  ERC20: 'ERC20',
};

type AnyFunc = (...args: any) => any;

export interface CustomFnArgs {
  event?: unknown;
  rawEvent?: any;
  configService?: ConfigService;
  endBlock?: number;
  findQuotesForTimestamp?: AnyFunc;
  blocksDictionary?: BlocksDictionary;
  allQuotes?: Quote[];
  customData?: any;
  pairsDictionary?: PairsDictionary;
  tokens?: TokensByAddress;
}

@Injectable()
export class HarvesterService {
  constructor(
    private lastProcessedBlockService: LastProcessedBlockService,
    private blockService: BlockService,
    private configService: ConfigService,
  ) {}

  async fetchEventsFromBlockchain(
    contractName: ContractsNames,
    eventName: string,
    fromBlock: number,
    toBlock: number,
    address?: string,
    deployment?: Deployment, // Accept deployment directly
  ): Promise<any[]> {
    if (fromBlock > toBlock) {
      return [];
    }

    const events = [];
    const tasks = [];
    const ranges = [];
    let rangeStart = fromBlock;
    if (VERSIONS[contractName]) {
      VERSIONS[contractName].forEach(({ terminatesAt, version }) => {
        if (rangeStart > toBlock) {
          return;
        }
        ranges.push({ rangeStart, rangeEnd: terminatesAt || toBlock, version });
        rangeStart = terminatesAt + 1;
      });
    } else {
      ranges.push({ rangeStart: fromBlock, rangeEnd: toBlock });
    }
    const limit = (await import('p-limit')).default;
    const concurrency = limit(deployment.harvestConcurrency);

    for (const range of ranges) {
      const contract = this.getContract(contractName, range.version, address, deployment);

      for (
        let startBlock = range.rangeStart;
        startBlock <= range.rangeEnd;
        startBlock += deployment.harvestEventsBatchSize
      ) {
        const endBlock = Math.min(startBlock + deployment.harvestEventsBatchSize - 1, range.rangeEnd, toBlock);
        tasks.push(
          concurrency(async () => {
            const _events = await contract.getPastEvents(eventName, {
              fromBlock: startBlock,
              toBlock: endBlock,
            });
            if (_events.length > 0) {
              _events.forEach((e) => events.push(e));
            }
          }),
        );
      }
    }

    await Promise.all(tasks);
    return events;
  }

  getContract(contractName: ContractsNames, version?: number, address?: string, deployment?: Deployment): any {
    const web3 = new Web3(deployment.rpcEndpoint);

    // Determine contract address
    const contractAddress = address || deployment?.contracts[contractName]?.address;
    if (!contractAddress) {
      throw new Error(`Contract ${contractName} address not found in deployment configuration`);
    }

    // Create and return contract instance
    return new web3.eth.Contract(Contracts[contractName], contractAddress);
  }

  async processEvents(args: ProcessEventsArgs): Promise<any[]> {
    const { deployment } = args;
    const key = `${deployment.blockchainType}-${deployment.exchangeId}-${args.entity}`;
    const lastProcessedBlock = await this.lastProcessedBlockService.getOrInit(key, deployment.startBlock);
    const result = [];

    if (args.skipPreClearing !== true) {
      await this.preClear(args.repository, lastProcessedBlock, deployment);
    }

    const limit = (await import('p-limit')).default;
    const concurrencyLimit = limit(deployment.harvestConcurrency);

    for (
      let rangeStart = lastProcessedBlock + 1;
      rangeStart <= args.endBlock;
      rangeStart += deployment.harvestEventsBatchSize * deployment.harvestConcurrency + 1
    ) {
      const rangeEnd = Math.min(
        rangeStart + deployment.harvestEventsBatchSize * deployment.harvestConcurrency,
        args.endBlock,
      );

      const events = await this.fetchEventsFromBlockchain(
        args.contractName,
        args.eventName,
        rangeStart,
        rangeEnd,
        args.contractAddress,
        deployment,
      );

      if (events.length > 0) {
        let blocksDictionary: BlocksDictionary;

        if (args.tagTimestampFromBlock) {
          const blockIds = [...new Set(events.map((b) => Number(b.blockNumber)))];
          blocksDictionary = await this.blockService.getBlocksDictionary(blockIds, deployment);
        }

        const newEvents = await Promise.all(
          events.map(async (e) => {
            let newEvent = args.repository.create({
              block: { id: Number(e.blockNumber) },
              transactionIndex: Number(e.transactionIndex),
              transactionHash: e.transactionHash,
              logIndex: Number(e.logIndex),
              blockchainType: deployment.blockchainType,
              exchangeId: deployment.exchangeId,
            });

            if (args.constants) {
              args.constants.forEach((c) => (newEvent[c.key] = c.value));
            }

            if (e.returnValues['owner']) {
              newEvent['owner'] = e.returnValues['owner'];
            }

            if (e.returnValues['token0'] && e.returnValues['token1'] && args.tokens) {
              newEvent['token0'] = args.tokens[e.returnValues['token0']];
              newEvent['token1'] = args.tokens[e.returnValues['token1']];
            }

            if (e.returnValues['token0'] && e.returnValues['token1'] && args.pairsDictionary) {
              newEvent['pair'] = args.pairsDictionary[e.returnValues['token0']][e.returnValues['token1']];
            }

            if (args.stringFields) {
              args.stringFields.forEach((f) => (newEvent[f] = e.returnValues[f]));
            }

            if (args.numberFields) {
              args.numberFields.forEach((f) => (newEvent[f] = Number(e.returnValues[f])));
            }

            if (args.bigNumberFields) {
              args.bigNumberFields.forEach((f) => (newEvent[f] = BigNumber.from(e.returnValues[f]).toString()));
            }

            if (args.booleanFields) {
              args.booleanFields.forEach((f) => {
                newEvent[f] = e.returnValues[f];
              });
            }

            if (args.tagTimestampFromBlock) {
              newEvent['timestamp'] = blocksDictionary[e.blockNumber];
            }

            if (args.dateFields) {
              args.dateFields.forEach((dateField) => {
                newEvent[dateField] = moment(e.returnValues[dateField] * 1000);
              });
            }

            if (args.sourceMap) {
              args.sourceMap.forEach((sourceMapItem) => {
                const value = sourceMapItem.isRelation
                  ? { id: parseInt(e.returnValues[sourceMapItem.eventKey]) }
                  : e.returnValues[sourceMapItem.eventKey];
                newEvent[sourceMapItem.key] = value;
              });
            }

            if (args.fetchCallerId) {
              await concurrencyLimit(async () => {
                const web3 = new Web3(deployment.rpcEndpoint);
                const transaction = await web3.eth.getTransaction(e.transactionHash);
                newEvent['callerId'] = transaction.from;

                await sleep(deployment.harvestSleep || 0);
              });
            }

            if (args.customFns) {
              for (const fn of args.customFns) {
                newEvent = await fn({
                  event: newEvent,
                  rawEvent: e,
                  configService: this.configService,
                  endBlock: args.endBlock,
                  blocksDictionary,
                  findQuotesForTimestamp: args.findQuotesForTimestamp,
                  allQuotes: args.allQuotes,
                  customData: args.customData,
                  pairsDictionary: args.pairsDictionary,
                  tokens: args.tokens,
                });
              }
            }

            return newEvent;
          }),
        );

        const batches = _.chunk(newEvents, 1000);
        await Promise.all(batches.map((batch) => args.repository.save(batch)));

        result.push(newEvents);
      }

      if (args.skipLastProcessedBlockUpdate !== true) {
        await this.lastProcessedBlockService.update(key, rangeEnd);
      }
    }

    return result;
  }

  async latestBlock(deployment: Deployment): Promise<number> {
    const web3 = new Web3(deployment.rpcEndpoint);
    const blockNumber = (await web3.eth.getBlockNumber()).toString();
    return parseInt(blockNumber);
  }

  async preClear(repository: Repository<any>, lastProcessedBlock: number, deployment: Deployment): Promise<void> {
    await repository
      .createQueryBuilder()
      .delete()
      .where('block.id > :lastProcessedBlock', { lastProcessedBlock })
      .andWhere('blockchainType = :blockchainType', { blockchainType: deployment.blockchainType })
      .andWhere('exchangeId = :exchangeId', { exchangeId: deployment.exchangeId })
      .execute();
  }

  async stringsWithMulticall(addresses: string[], abi: any, fn: string, deployment: Deployment): Promise<string[]> {
    if (deployment.blockchainType === BlockchainType.Ethereum) {
      return this.stringsWithMulticallV2(addresses, abi, fn, deployment);
    } else {
      return this.stringsWithMulticallV3(addresses, abi, fn, deployment);
    }
  }

  async integersWithMulticall(addresses: string[], abi: any, fn: string, deployment: Deployment): Promise<number[]> {
    if (deployment.blockchainType === BlockchainType.Ethereum) {
      return this.integersWithMulticallEthereum(addresses, abi, fn, deployment);
    } else {
      return this.integersWithMulticallSei(addresses, abi, fn, deployment);
    }
  }

  async stringsWithMulticallV2(addresses: string[], abi: any, fn: string, deployment: Deployment): Promise<string[]> {
    const data = await this.withMulticallEthereum(addresses, abi, fn, deployment);
    return data.map((r) => hexToString(r.data).replace(/[^a-zA-Z0-9]/g, ''));
  }

  async integersWithMulticallEthereum(
    addresses: string[],
    abi: any,
    fn: string,
    deployment: Deployment,
  ): Promise<number[]> {
    const data = await this.withMulticallEthereum(addresses, abi, fn, deployment);
    return data.map((r) => parseInt(r.data));
  }

  async stringsWithMulticallV3(addresses: string[], abi: any, fn: string, deployment: Deployment): Promise<string[]> {
    const data = await this.withMulticallSei(addresses, abi, fn, deployment);
    return data.map((r) => hexToString(r).replace(/[^a-zA-Z0-9]/g, ''));
  }

  async integersWithMulticallSei(addresses: string[], abi: any, fn: string, deployment: Deployment): Promise<number[]> {
    const data = await this.withMulticallSei(addresses, abi, fn, deployment);
    return data.map((r) => parseInt(r));
  }
  async withMulticallEthereum(addresses: string[], abi: any, fn: string, deployment: Deployment): Promise<any> {
    const web3 = new Web3(deployment.rpcEndpoint);

    const multicall: any = new web3.eth.Contract(MulticallAbiEthereum, deployment.multicallAddress); // Use multicallAddress from deployment
    let data = [];
    const batches = _.chunk(addresses, 1000);
    for (const batch of batches) {
      const calls = [];
      batch.forEach((address) => {
        const contract = new web3.eth.Contract([abi], address);
        calls.push([contract.options.address, contract.methods[fn]().encodeABI()]);
      });

      if (calls.length > 0) {
        const result = await multicall.methods.aggregate(calls, false).call();
        data = data.concat(result.returnData);
      }
    }
    return data;
  }

  async withMulticallSei(addresses: string[], abi: any, fn: string, deployment: Deployment): Promise<any> {
    const web3 = new Web3(deployment.rpcEndpoint);

    const multicall: any = new web3.eth.Contract(multicallAbiSei, deployment.multicallAddress); // Use multicallAddress from deployment
    let data = [];
    const batches = _.chunk(addresses, 1000);
    for (const batch of batches) {
      const calls = [];
      batch.forEach((address) => {
        const contract = new web3.eth.Contract([abi], address);
        calls.push({ target: contract.options.address, callData: contract.methods[fn]().encodeABI() });
      });

      if (calls.length > 0) {
        const result = await multicall.methods.aggregate(calls).call();
        data = data.concat(result.returnData);
      }
    }
    return data;
  }
}

const camelToSnakeCase = (str) => str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

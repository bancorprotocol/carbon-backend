import { ConfigService } from '@nestjs/config';
import { Injectable, Inject } from '@nestjs/common';
import Web3 from 'web3';
import * as _ from 'lodash';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { Repository } from 'typeorm';
import { PairsDictionary } from '../pair/pair.service';
import { BlockService, BlocksDictionary } from '../block/block.service';
import { Quote } from '../quote/quote.entity';
import { ERC20 } from '../abis/erc20.abi';
import moment from 'moment';
import { MulticallAbiEthereum } from '../abis/multicall.abi';
import { multicallAbiSei } from '../abis/multicall.abi';
import { hexToString } from 'web3-utils';
import { TokensByAddress } from '../token/token.service';
import { BigNumber } from '@ethersproject/bignumber';

export const VERSIONS = {
  // PoolMigrator: [{ terminatesAt: 14830503, version: 1 }, { version: 2 }],
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
  contractName?: string;
  eventName: string;
  endBlock: number;
  repository: Repository<unknown>;
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

export enum BlockchainType {
  Ethereum = 'ethereum',
  Sei = 'sei',
}

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
  private harvestEventsBatchSize;
  private harvestConcurrency;

  constructor(
    private configService: ConfigService,
    private lastProcessedBlockService: LastProcessedBlockService,
    private blockService: BlockService,
    @Inject('BLOCKCHAIN_CONFIG') private blockchainConfig: any,
  ) {
    this.harvestEventsBatchSize = +this.configService.get('HARVEST_EVENTS_BATCH_SIZE');
    this.harvestConcurrency = +this.configService.get('HARVEST_CONCURRENCY');
  }

  async fetchEventsFromBlockchain(
    contractName: string,
    eventName: string,
    fromBlock: number,
    toBlock: number,
    address?: string,
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
    const concurrency = limit(this.harvestConcurrency);

    for (const range of ranges) {
      const contract = this.getContract(contractName, range.version, address);

      for (let startBlock = range.rangeStart; startBlock <= range.rangeEnd; startBlock += this.harvestEventsBatchSize) {
        const endBlock = Math.min(startBlock + this.harvestEventsBatchSize - 1, range.rangeEnd, toBlock);
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

  getContract(contractName: string, version?: number, address?: string): any {
    const web3 = new Web3(this.blockchainConfig.ethereumEndpoint);
    let contract;
    if (contractName === ContractNames.ERC20) {
      contract = new web3.eth.Contract(ERC20, address);
    } else {
      const contractsEnv = this.contractsEnv();
      let path = `../contracts/${contractsEnv}/${contractName}`;
      if (version) path += `V${version}`;
      path += '.json';
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const contractJson = require(path);

      let _address;
      if (address) {
        _address = address;
      } else {
        let configName = camelToSnakeCase(contractName).toUpperCase();
        if (configName[0] === '_') configName = configName.substring(1);
        const configValue = this.configService.get(configName);
        if (configValue) {
          _address = configValue;
        } else {
          _address = contractJson.address;
        }
      }
      contract = new web3.eth.Contract(contractJson.abi, _address);
    }
    return contract;
  }

  async processEvents(args: ProcessEventsArgs): Promise<any[]> {
    const {
      entity,
      contractAddress,
      contractName,
      eventName,
      endBlock,
      repository,
      constants,
      tagTimestampFromBlock,
      allQuotes,
      customFns,
      skipLastProcessedBlockUpdate,
      findQuotesForTimestamp,
      dateFields,
      sourceMap,
      customData,
      skipPreClearing,
      terminatesAt,
      startAtBlock,
      tokens,
      pairsDictionary,
      stringFields,
      numberFields,
      bigNumberFields,
      booleanFields,
    } = args;

    const lastProcessedBlock = await this.lastProcessedBlockService.getOrInit(entity);

    // avoid processing terminated contracts/methods
    if (terminatesAt && lastProcessedBlock + 1 > terminatesAt) return;

    if (skipPreClearing !== true) {
      await this.preClear(repository, lastProcessedBlock);
    }

    const startAt = startAtBlock && startAtBlock > lastProcessedBlock + 1 ? startAtBlock : lastProcessedBlock + 1;
    const events = await this.fetchEventsFromBlockchain(
      contractName,
      eventName,
      startAt,
      terminatesAt || endBlock,
      contractAddress,
    );

    let newEvents = [];
    if (events.length > 0) {
      let blocksDictionary: BlocksDictionary;

      if (tagTimestampFromBlock) {
        const blockIds = [...new Set(events.map((b) => Number(b.blockNumber)))];
        blocksDictionary = await this.blockService.getBlocksDictionary(blockIds);
      }

      newEvents = await Promise.all(
        events.map(async (e) => {
          let newEvent = repository.create({
            block: { id: Number(e.blockNumber) },
            transactionIndex: Number(e.transactionIndex),
            transactionHash: e.transactionHash,
            logIndex: Number(e.logIndex),
          });

          if (constants) {
            constants.forEach((c) => (newEvent[c.key] = c.value));
          }

          if (e.returnValues['owner']) {
            newEvent['owner'] = e.returnValues['owner'];
          }

          if (e.returnValues['token0'] && e.returnValues['token1'] && tokens) {
            newEvent['token0'] = tokens[e.returnValues['token0']];
            newEvent['token1'] = tokens[e.returnValues['token1']];
          }

          if (e.returnValues['token0'] && e.returnValues['token1'] && pairsDictionary) {
            newEvent['pair'] = pairsDictionary[e.returnValues['token0']][e.returnValues['token1']];
          }

          if (stringFields) {
            stringFields.forEach((f) => (newEvent[f] = e.returnValues[f]));
          }

          if (numberFields) {
            numberFields.forEach((f) => (newEvent[f] = Number(e.returnValues[f])));
          }

          if (bigNumberFields) {
            bigNumberFields.forEach((f) => (newEvent[f] = BigNumber.from(e.returnValues[f]).toString()));
          }

          if (booleanFields) {
            booleanFields.forEach((f) => {
              newEvent[f] = e.returnValues[f];
            });
          }

          if (tagTimestampFromBlock) {
            newEvent['timestamp'] = blocksDictionary[e.blockNumber];
          }

          if (dateFields) {
            dateFields.forEach((dateField) => {
              newEvent[dateField] = moment(e.returnValues[dateField] * 1000);
            });
          }

          if (sourceMap) {
            sourceMap.forEach((sourceMapItem) => {
              const value = sourceMapItem.isRelation
                ? { id: parseInt(e.returnValues[sourceMapItem.eventKey]) }
                : e.returnValues[sourceMapItem.eventKey];
              newEvent[sourceMapItem.key] = value;
            });
          }

          if (customFns) {
            for (const fn of customFns) {
              newEvent = await fn({
                event: newEvent,
                rawEvent: e,
                configService: this.configService,
                endBlock,
                blocksDictionary,
                findQuotesForTimestamp,
                allQuotes,
                customData,
                pairsDictionary,
                tokens,
              });
            }
          }

          return newEvent;
        }),
      );

      const batches = _.chunk(newEvents, 1000);
      await Promise.all(batches.map((batch) => repository.save(batch)));
    }

    if (skipLastProcessedBlockUpdate !== true) {
      await this.lastProcessedBlockService.update(entity, endBlock);
    }

    return newEvents.sort((a, b) => a.block.id - b.block.id);
  }

  async latestBlock(): Promise<number> {
    const web3 = new Web3(this.blockchainConfig.ethereumEndpoint);
    const blockNumber = (await web3.eth.getBlockNumber()).toString();
    return parseInt(blockNumber);
  }

  async preClear(repository: Repository<any>, lastProcessedBlock: number): Promise<void> {
    await repository
      .createQueryBuilder()
      .delete()
      .where('block.id > :lastProcessedBlock', { lastProcessedBlock })
      .execute();
  }

  contractsEnv(): string {
    return this.configService.get('CONTRACTS_ENV');
  }

  async stringsWithMulticall(
    addresses: string[],
    abi: any,
    fn: string,
    blockchainType: BlockchainType,
  ): Promise<string[]> {
    if (blockchainType === BlockchainType.Sei) {
      return this.stringsWithMulticallSei(addresses, abi, fn);
    } else if (blockchainType === BlockchainType.Ethereum) {
      return this.stringsWithMulticallEthereum(addresses, abi, fn);
    }
  }

  async integersWithMulticall(
    addresses: string[],
    abi: any,
    fn: string,
    blockchainType: BlockchainType,
  ): Promise<number[]> {
    if (blockchainType === BlockchainType.Sei) {
      return this.integersWithMulticallSei(addresses, abi, fn);
    } else if (blockchainType === BlockchainType.Ethereum) {
      return this.integersWithMulticallEthereum(addresses, abi, fn);
    }
  }

  async stringsWithMulticallEthereum(addresses: string[], abi: any, fn: string): Promise<string[]> {
    const data = await this.withMulticallEthereum(addresses, abi, fn);
    return data.map((r) => hexToString(r.data).replace(/[^a-zA-Z0-9]/g, ''));
  }

  async integersWithMulticallEthereum(addresses: string[], abi: any, fn: string): Promise<number[]> {
    const data = await this.withMulticallEthereum(addresses, abi, fn);
    return data.map((r) => parseInt(r.data));
  }

  async withMulticallEthereum(addresses: string[], abi: any, fn: string): Promise<any> {
    const web3 = new Web3(this.blockchainConfig.ethereumEndpoint);

    const multicall: any = new web3.eth.Contract(MulticallAbiEthereum, this.configService.get('MULTICALL_ADDRESS'));
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

  async stringsWithMulticallSei(addresses: string[], abi: any, fn: string): Promise<string[]> {
    const data = await this.withMulticallSei(addresses, abi, fn);
    return data.map((r) => hexToString(r).replace(/[^a-zA-Z0-9]/g, ''));
  }

  async integersWithMulticallSei(addresses: string[], abi: any, fn: string): Promise<number[]> {
    const data = await this.withMulticallSei(addresses, abi, fn);
    return data.map((r) => parseInt(r));
  }

  async withMulticallSei(addresses: string[], abi: any, fn: string): Promise<any> {
    const web3 = new Web3(this.blockchainConfig.ethereumEndpoint);

    const multicall: any = new web3.eth.Contract(multicallAbiSei, this.configService.get('MULTICALL_ADDRESS'));
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

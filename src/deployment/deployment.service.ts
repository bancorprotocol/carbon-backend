// deployment.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventTypes } from '../events/event-types';

export const NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export enum BlockchainType {
  Ethereum = 'ethereum',
  Sei = 'sei-network',
  Celo = 'celo',
  Blast = 'blast',
  Base = 'base',
}

export enum ExchangeId {
  OGEthereum = 'ethereum',
  OGSei = 'sei',
  OGCelo = 'celo',
  OGBlast = 'blast',
  BaseGraphene = 'base-graphene',
}

export interface GasToken {
  name: string;
  symbol: string;
  address: string;
}

export interface Deployment {
  exchangeId: ExchangeId;
  blockchainType: BlockchainType;
  rpcEndpoint: string;
  harvestEventsBatchSize: number;
  harvestConcurrency: number;
  multicallAddress: string;
  gasToken: GasToken;
  startBlock: number;
  nativeTokenAlias?: string;
  contracts: {
    [contractName: string]: {
      address: string;
    };
  };
  notifications?: {
    explorerUrl: string;
    carbonWalletUrl: string;
    disabledEvents?: EventTypes[];
    telegram: {
      botToken: string;
      threads: {
        carbonThreadId: number;
        fastlaneId: number;
        vortexId: number;
      };
    };
  };
}

@Injectable()
export class DeploymentService {
  private deployments: Deployment[];
  constructor(private configService: ConfigService) {
    this.deployments = this.initializeDeployments();
  }

  private initializeDeployments(): Deployment[] {
    return [
      {
        exchangeId: ExchangeId.OGEthereum,
        blockchainType: BlockchainType.Ethereum,
        rpcEndpoint: this.configService.get('ETHEREUM_RPC_ENDPOINT'),
        harvestEventsBatchSize: 100000,
        harvestConcurrency: 10,
        multicallAddress: '0x5Eb3fa2DFECdDe21C950813C665E9364fa609bD2',
        startBlock: 17087000,
        gasToken: {
          name: 'Ethereum',
          symbol: 'ETH',
          address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        },
        contracts: {
          CarbonController: {
            address: '0xC537e898CD774e2dCBa3B14Ea6f34C93d5eA45e1',
          },
          CarbonVortex: {
            address: '0xD053Dcd7037AF7204cecE544Ea9F227824d79801',
          },
          CarbonPOL: {
            address: '0xD06146D292F9651C1D7cf54A3162791DFc2bEf46',
          },
          CarbonVoucher: {
            address: '0x3660F04B79751e31128f6378eAC70807e38f554E',
          },
          BancorArbitrage: {
            address: '0x41Eeba3355d7D6FF628B7982F3F9D055c39488cB',
          },
        },
        notifications: {
          explorerUrl: this.configService.get('ETHEREUM_EXPLORER_URL'),
          carbonWalletUrl: this.configService.get('ETHEREUM_CARBON_WALLET_URL'),
          telegram: {
            botToken: this.configService.get('ETHEREUM_TELEGRAM_BOT_TOKEN'),
            threads: {
              carbonThreadId: this.configService.get('ETHEREUM_CARBON_THREAD_ID'),
              fastlaneId: this.configService.get('ETHEREUM_FASTLANE_THREAD_ID'),
              vortexId: this.configService.get('ETHEREUM_VORTEX_THREAD_ID'),
            },
          },
        },
      },
      {
        exchangeId: ExchangeId.OGSei,
        blockchainType: BlockchainType.Sei,
        rpcEndpoint: this.configService.get('SEI_RPC_ENDPOINT'),
        harvestEventsBatchSize: 1000,
        harvestConcurrency: 1,
        multicallAddress: '0x51aA24A9230e62CfaF259c47DE3133578cE36317',
        startBlock: 79146720,
        gasToken: {
          name: 'Sei',
          symbol: 'SEI',
          address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        },
        nativeTokenAlias: '0xe30fedd158a2e3b13e9badaeabafc5516e95e8c7',
        contracts: {
          CarbonController: {
            address: '0xe4816658ad10bF215053C533cceAe3f59e1f1087',
          },
          CarbonVoucher: {
            address: '0xA4682A2A5Fe02feFF8Bd200240A41AD0E6EaF8d5',
          },
          BancorArbitrage: {
            address: '0xC56Eb3d03C5D7720DAf33a3718affb9BcAb03FBc',
          },
          CarbonVortex: {
            address: '0x5715203B16F15d7349Cb1E3537365E9664EAf933',
          },
        },
        notifications: {
          explorerUrl: this.configService.get('SEI_EXPLORER_URL'),
          carbonWalletUrl: this.configService.get('SEI_CARBON_WALLET_URL'),
          telegram: {
            botToken: this.configService.get('SEI_TELEGRAM_BOT_TOKEN'),
            threads: {
              carbonThreadId: this.configService.get('SEI_CARBON_THREAD_ID'),
              fastlaneId: this.configService.get('SEI_FASTLANE_THREAD_ID'),
              vortexId: this.configService.get('SEI_VORTEX_THREAD_ID'),
            },
          },
        },
      },
      {
        exchangeId: ExchangeId.OGCelo,
        blockchainType: BlockchainType.Celo,
        rpcEndpoint: this.configService.get('CELO_RPC_ENDPOINT'),
        harvestEventsBatchSize: 1000,
        harvestConcurrency: 1,
        multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
        startBlock: 26808466,
        gasToken: {
          name: 'Celo',
          symbol: 'CELO',
          address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        },
        nativeTokenAlias: '0x471ece3750da237f93b8e339c536989b8978a438',
        contracts: {
          CarbonController: {
            address: '0x6619871118D144c1c28eC3b23036FC1f0829ed3a',
          },
          CarbonVoucher: {
            address: '0x5E994Ac7d65d81f51a76e0bB5a236C6fDA8dBF9A',
          },
          BancorArbitrage: {
            address: '0x8c05EA305235a67c7095a32Ad4a2Ee2688aDe636',
          },
          CarbonVortex: {
            address: '0xa15E3295465439A361dBcac79C1DBCE6Cd01E562',
          },
        },
        notifications: {
          explorerUrl: this.configService.get('CELO_EXPLORER_URL'),
          carbonWalletUrl: this.configService.get('CELO_CARBON_WALLET_URL'),
          telegram: {
            botToken: this.configService.get('CELO_TELEGRAM_BOT_TOKEN'),
            threads: {
              carbonThreadId: this.configService.get('CELO_CARBON_THREAD_ID'),
              fastlaneId: this.configService.get('CELO_FASTLANE_THREAD_ID'),
              vortexId: this.configService.get('CELO_VORTEX_THREAD_ID'),
            },
          },
        },
      },
      {
        exchangeId: ExchangeId.OGBlast,
        blockchainType: BlockchainType.Blast,
        rpcEndpoint: this.configService.get('BLAST_RPC_ENDPOINT'),
        harvestEventsBatchSize: 1000,
        harvestConcurrency: 5,
        multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
        startBlock: 6257000,
        gasToken: {
          name: 'Blast',
          symbol: 'BLAST',
          address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        },
        contracts: {
          CarbonController: {
            address: '0xfBF49e30Ed1b610E24148c23D32eD5f3F2fC5Dba',
          },
          CarbonVoucher: {
            address: '0xfA76DcA90d334C8fD3Ae479f9B4c32a31A37eDB1',
          },
          BancorArbitrage: {
            address: '0xC7Dd38e64822108446872c5C2105308058c5C55C',
          },
          CarbonVortex: {
            address: '0x0f54099D787e26c90c487625B4dE819eC5A9BDAA',
          },
        },
        notifications: {
          explorerUrl: this.configService.get('BLAST_EXPLORER_URL'),
          carbonWalletUrl: this.configService.get('BLAST_CARBON_WALLET_URL'),
          disabledEvents: [EventTypes.TokensTradedEvent],
          telegram: {
            botToken: this.configService.get('BLAST_TELEGRAM_BOT_TOKEN'),
            threads: {
              carbonThreadId: this.configService.get('BLAST_CARBON_THREAD_ID'),
              fastlaneId: this.configService.get('BLAST_FASTLANE_THREAD_ID'),
              vortexId: this.configService.get('BLAST_VORTEX_THREAD_ID'),
            },
          },
        },
      },
      {
        exchangeId: ExchangeId.BaseGraphene,
        blockchainType: BlockchainType.Base,
        rpcEndpoint: this.configService.get('BASE_RPC_ENDPOINT'),
        harvestEventsBatchSize: 20000,
        harvestConcurrency: 10,
        multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
        startBlock: 5314500,
        gasToken: {
          name: 'Ether',
          symbol: 'ETH',
          address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        },
        contracts: {
          CarbonController: {
            address: '0xfbf069dbbf453c1ab23042083cfa980b3a672bba',
          },
          CarbonVoucher: {
            address: '0x907F03ae649581EBFF369a21C587cb8F154A0B84',
          },
          BancorArbitrage: {
            address: '0x2ae2404cd44c830d278f51f053a08f54b3756e1c',
          },
          CarbonVortex: {
            address: '0xA4682A2A5Fe02feFF8Bd200240A41AD0E6EaF8d5',
          },
        },
        notifications: {
          explorerUrl: this.configService.get('BASE_EXPLORER_URL'),
          carbonWalletUrl: this.configService.get('BASE_GRAPHENE_WALLET_URL'),
          telegram: {
            botToken: this.configService.get('BASE_TELEGRAM_BOT_TOKEN'),
            threads: {
              carbonThreadId: this.configService.get('BASE_CARBON_THREAD_ID'),
              fastlaneId: this.configService.get('BASE_FASTLANE_THREAD_ID'),
              vortexId: this.configService.get('BASE_VORTEX_THREAD_ID'),
            },
          },
        },
      },
    ];
  }

  getDeployments(): Deployment[] {
    return this.deployments;
  }

  getDeploymentByExchangeId(exchangeId: ExchangeId): Deployment {
    const deployment = this.deployments.find((d) => d.exchangeId === exchangeId);
    if (!deployment) {
      throw new Error(`Deployment for exchangeId ${exchangeId} not found`);
    }
    return deployment;
  }

  getDeploymentByBlockchainType(blockchainType: BlockchainType): Deployment {
    const deployment = this.deployments.find((d) => d.blockchainType === blockchainType);
    if (!deployment) {
      throw new Error(`Deployment for blockchainType ${blockchainType} not found`);
    }
    return deployment;
  }
}

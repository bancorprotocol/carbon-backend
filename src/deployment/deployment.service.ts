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
  Fantom = 'fantom',
  Mantle = 'mantle',
}

export enum ExchangeId {
  OGEthereum = 'ethereum',
  OGSei = 'sei',
  OGCelo = 'celo',
  OGBlast = 'blast',
  BaseGraphene = 'base-graphene',
  FantomGraphene = 'fantom-graphene',
  MantleGraphene = 'mantle-graphene',
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
      // {
      //   exchangeId: ExchangeId.OGEthereum,
      //   blockchainType: BlockchainType.Ethereum,
      //   rpcEndpoint: this.configService.get('ETHEREUM_RPC_ENDPOINT'),
      //   harvestEventsBatchSize: 100000,
      //   harvestConcurrency: 10,
      //   multicallAddress: '0x5Eb3fa2DFECdDe21C950813C665E9364fa609bD2',
      //   startBlock: 17087000,
      //   gasToken: {
      //     name: 'Ethereum',
      //     symbol: 'ETH',
      //     address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      //   },
      //   contracts: {
      //     CarbonController: {
      //       address: '0xC537e898CD774e2dCBa3B14Ea6f34C93d5eA45e1',
      //     },
      //     CarbonVortex: {
      //       address: '0xD053Dcd7037AF7204cecE544Ea9F227824d79801',
      //     },
      //     CarbonPOL: {
      //       address: '0xD06146D292F9651C1D7cf54A3162791DFc2bEf46',
      //     },
      //     CarbonVoucher: {
      //       address: '0x3660F04B79751e31128f6378eAC70807e38f554E',
      //     },
      //     BancorArbitrage: {
      //       address: '0x41Eeba3355d7D6FF628B7982F3F9D055c39488cB',
      //     },
      //   },
      //   notifications: {
      //     explorerUrl: this.configService.get('ETHEREUM_EXPLORER_URL'),
      //     carbonWalletUrl: this.configService.get('ETHEREUM_CARBON_WALLET_URL'),
      //     telegram: {
      //       botToken: this.configService.get('ETHEREUM_TELEGRAM_BOT_TOKEN'),
      //       threads: {
      //         carbonThreadId: this.configService.get('ETHEREUM_CARBON_THREAD_ID'),
      //         fastlaneId: this.configService.get('ETHEREUM_FASTLANE_THREAD_ID'),
      //         vortexId: this.configService.get('ETHEREUM_VORTEX_THREAD_ID'),
      //       },
      //     },
      //   },
      // },
      // {
      //   exchangeId: ExchangeId.OGSei,
      //   blockchainType: BlockchainType.Sei,
      //   rpcEndpoint: this.configService.get('SEI_RPC_ENDPOINT'),
      //   harvestEventsBatchSize: 1000,
      //   harvestConcurrency: 1,
      //   multicallAddress: '0x51aA24A9230e62CfaF259c47DE3133578cE36317',
      //   startBlock: 79146720,
      //   gasToken: {
      //     name: 'Sei',
      //     symbol: 'SEI',
      //     address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      //   },
      //   nativeTokenAlias: '0xe30fedd158a2e3b13e9badaeabafc5516e95e8c7',
      //   contracts: {
      //     CarbonController: {
      //       address: '0xe4816658ad10bF215053C533cceAe3f59e1f1087',
      //     },
      //     CarbonVoucher: {
      //       address: '0xA4682A2A5Fe02feFF8Bd200240A41AD0E6EaF8d5',
      //     },
      //     BancorArbitrage: {
      //       address: '0xC56Eb3d03C5D7720DAf33a3718affb9BcAb03FBc',
      //     },
      //     CarbonVortex: {
      //       address: '0x5715203B16F15d7349Cb1E3537365E9664EAf933',
      //     },
      //   },
      //   notifications: {
      //     explorerUrl: this.configService.get('SEI_EXPLORER_URL'),
      //     carbonWalletUrl: this.configService.get('SEI_CARBON_WALLET_URL'),
      //     telegram: {
      //       botToken: this.configService.get('SEI_TELEGRAM_BOT_TOKEN'),
      //       threads: {
      //         carbonThreadId: this.configService.get('SEI_CARBON_THREAD_ID'),
      //         fastlaneId: this.configService.get('SEI_FASTLANE_THREAD_ID'),
      //         vortexId: this.configService.get('SEI_VORTEX_THREAD_ID'),
      //       },
      //     },
      //   },
      // },
      // {
      //   exchangeId: ExchangeId.OGCelo,
      //   blockchainType: BlockchainType.Celo,
      //   rpcEndpoint: this.configService.get('CELO_RPC_ENDPOINT'),
      //   harvestEventsBatchSize: 1000,
      //   harvestConcurrency: 1,
      //   multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      //   startBlock: 26808466,
      //   gasToken: {
      //     name: 'Celo',
      //     symbol: 'CELO',
      //     address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      //   },
      //   nativeTokenAlias: '0x471ece3750da237f93b8e339c536989b8978a438',
      //   contracts: {
      //     CarbonController: {
      //       address: '0x6619871118D144c1c28eC3b23036FC1f0829ed3a',
      //     },
      //     CarbonVoucher: {
      //       address: '0x5E994Ac7d65d81f51a76e0bB5a236C6fDA8dBF9A',
      //     },
      //     BancorArbitrage: {
      //       address: '0x8c05EA305235a67c7095a32Ad4a2Ee2688aDe636',
      //     },
      //     CarbonVortex: {
      //       address: '0xa15E3295465439A361dBcac79C1DBCE6Cd01E562',
      //     },
      //   },
      //   notifications: {
      //     explorerUrl: this.configService.get('CELO_EXPLORER_URL'),
      //     carbonWalletUrl: this.configService.get('CELO_CARBON_WALLET_URL'),
      //     telegram: {
      //       botToken: this.configService.get('CELO_TELEGRAM_BOT_TOKEN'),
      //       threads: {
      //         carbonThreadId: this.configService.get('CELO_CARBON_THREAD_ID'),
      //         fastlaneId: this.configService.get('CELO_FASTLANE_THREAD_ID'),
      //         vortexId: this.configService.get('CELO_VORTEX_THREAD_ID'),
      //       },
      //     },
      //   },
      // },
      // {
      //   exchangeId: ExchangeId.OGBlast,
      //   blockchainType: BlockchainType.Blast,
      //   rpcEndpoint: this.configService.get('BLAST_RPC_ENDPOINT'),
      //   harvestEventsBatchSize: 1000,
      //   harvestConcurrency: 5,
      //   multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      //   startBlock: 6257000,
      //   gasToken: {
      //     name: 'Blast',
      //     symbol: 'BLAST',
      //     address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      //   },
      //   contracts: {
      //     CarbonController: {
      //       address: '0xfBF49e30Ed1b610E24148c23D32eD5f3F2fC5Dba',
      //     },
      //     CarbonVoucher: {
      //       address: '0xfA76DcA90d334C8fD3Ae479f9B4c32a31A37eDB1',
      //     },
      //     BancorArbitrage: {
      //       address: '0xC7Dd38e64822108446872c5C2105308058c5C55C',
      //     },
      //     CarbonVortex: {
      //       address: '0x0f54099D787e26c90c487625B4dE819eC5A9BDAA',
      //     },
      //   },
      //   notifications: {
      //     explorerUrl: this.configService.get('BLAST_EXPLORER_URL'),
      //     carbonWalletUrl: this.configService.get('BLAST_CARBON_WALLET_URL'),
      //     disabledEvents: [EventTypes.TokensTradedEvent],
      //     telegram: {
      //       botToken: this.configService.get('BLAST_TELEGRAM_BOT_TOKEN'),
      //       threads: {
      //         carbonThreadId: this.configService.get('BLAST_CARBON_THREAD_ID'),
      //         fastlaneId: this.configService.get('BLAST_FASTLANE_THREAD_ID'),
      //         vortexId: this.configService.get('BLAST_VORTEX_THREAD_ID'),
      //       },
      //     },
      //   },
      // },
      // {
      //   exchangeId: ExchangeId.BaseGraphene,
      //   blockchainType: BlockchainType.Base,
      //   rpcEndpoint: this.configService.get('BASE_RPC_ENDPOINT'),
      //   harvestEventsBatchSize: 20000,
      //   harvestConcurrency: 10,
      //   multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      //   startBlock: 5314500,
      //   gasToken: {
      //     name: 'Ether',
      //     symbol: 'ETH',
      //     address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      //   },
      //   contracts: {
      //     CarbonController: {
      //       address: '0xfbf069dbbf453c1ab23042083cfa980b3a672bba',
      //     },
      //     CarbonVoucher: {
      //       address: '0x907F03ae649581EBFF369a21C587cb8F154A0B84',
      //     },
      //     BancorArbitrage: {
      //       address: '0x2ae2404cd44c830d278f51f053a08f54b3756e1c',
      //     },
      //     CarbonVortex: {
      //       address: '0xA4682A2A5Fe02feFF8Bd200240A41AD0E6EaF8d5',
      //     },
      //   },
      //   notifications: {
      //     explorerUrl: this.configService.get('BASE_EXPLORER_URL'),
      //     carbonWalletUrl: this.configService.get('BASE_GRAPHENE_WALLET_URL'),
      //     telegram: {
      //       botToken: this.configService.get('BASE_TELEGRAM_BOT_TOKEN'),
      //       threads: {
      //         carbonThreadId: this.configService.get('BASE_CARBON_THREAD_ID'),
      //         fastlaneId: this.configService.get('BASE_FASTLANE_THREAD_ID'),
      //         vortexId: this.configService.get('BASE_VORTEX_THREAD_ID'),
      //       },
      //     },
      //   },
      // },
      // {
      //   exchangeId: ExchangeId.FantomGraphene,
      //   blockchainType: BlockchainType.Fantom,
      //   rpcEndpoint: this.configService.get('FANTOM_RPC_ENDPOINT'),
      //   harvestEventsBatchSize: 20000,
      //   harvestConcurrency: 10,
      //   multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
      //   startBlock: 69969086,
      //   gasToken: {
      //     name: 'Fantom',
      //     symbol: 'FTM',
      //     address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      //   },
      //   nativeTokenAlias: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
      //   contracts: {
      //     CarbonController: {
      //       address: '0xf37102e11E06276ac9D393277BD7b63b3393b361',
      //     },
      //     CarbonVoucher: {
      //       address: '0xf779D71178d96b5151D25DE608ac2Ab0558F6aA2',
      //     },
      //     BancorArbitrage: {
      //       address: '0xFe19CbA3aB1A189B7FC17cAa798Df64Ad2b54d4D',
      //     },
      //     CarbonVortex: {
      //       address: '0x4A0c4eF72e0BA9d6A2d34dAD6E794378d9Ad4130',
      //     },
      //   },
      //   notifications: {
      //     explorerUrl: this.configService.get('FANTOM_EXPLORER_URL'),
      //     carbonWalletUrl: this.configService.get('FANTOM_GRAPHENE_WALLET_URL'),
      //     telegram: {
      //       botToken: this.configService.get('FANTOM_TELEGRAM_BOT_TOKEN'),
      //       threads: {
      //         carbonThreadId: this.configService.get('FANTOM_CARBON_THREAD_ID'),
      //         fastlaneId: this.configService.get('FANTOM_FASTLANE_THREAD_ID'),
      //         vortexId: this.configService.get('FANTOM_VORTEX_THREAD_ID'),
      //       },
      //     },
      //   },
      // },
      {
        exchangeId: ExchangeId.MantleGraphene,
        blockchainType: BlockchainType.Mantle,
        rpcEndpoint: this.configService.get('MANTLE_RPC_ENDPOINT'),
        harvestEventsBatchSize: 20000,
        harvestConcurrency: 10,
        multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
        startBlock: 18438182,
        gasToken: {
          name: 'Mantle',
          symbol: 'MANTLE',
          address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        },
        nativeTokenAlias: '0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8',
        contracts: {
          CarbonController: {
            address: '0x7900f766F06e361FDDB4FdeBac5b138c4EEd8d4A',
          },
          CarbonVoucher: {
            address: '0x953A6D3f9DB06027b2feb8b76a76AA2FC8334865',
          },
          BancorArbitrage: {
            address: '0xC7Dd38e64822108446872c5C2105308058c5C55C',
          },
          CarbonVortex: {
            address: '0x59f21012B2E9BA67ce6a7605E74F945D0D4C84EA',
          },
        },
        notifications: {
          explorerUrl: this.configService.get('MANTLE_EXPLORER_URL'),
          carbonWalletUrl: this.configService.get('MANTLE_GRAPHENE_WALLET_URL'),
          telegram: {
            botToken: this.configService.get('MANTLE_TELEGRAM_BOT_TOKEN'),
            threads: {
              carbonThreadId: this.configService.get('MANTLE_CARBON_THREAD_ID'),
              fastlaneId: this.configService.get('MANTLE_FASTLANE_THREAD_ID'),
              vortexId: this.configService.get('MANTLE_VORTEX_THREAD_ID'),
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

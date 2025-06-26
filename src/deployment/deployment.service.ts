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
  Linea = 'linea',
  Berachain = 'berachain',
  Coti = 'coti',
  Iota = 'iota',
  Tac = 'tac',
}

export enum ExchangeId {
  OGEthereum = 'ethereum',
  OGSei = 'sei',
  OGCelo = 'celo',
  OGBlast = 'blast',
  BaseGraphene = 'base-graphene',
  FantomGraphene = 'fantom-graphene',
  MantleGraphene = 'mantle-graphene',
  MantleSupernova = 'mantle-supernova',
  LineaXFai = 'linea-xfai',
  BaseAlienBase = 'base-alienbase',
  BerachainGraphene = 'berachain-graphene',
  OGCoti = 'coti',
  IotaGraphene = 'iota-graphene',
  OGTac = 'tac',
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
  harvestSleep?: number;
  multicallAddress: string;
  gasToken: GasToken;
  startBlock: number;
  nativeTokenAlias?: string;
  mapEthereumTokens?: {
    [deploymentTokenAddress: string]: string;
  };
  contracts: {
    [contractName: string]: {
      address: string;
    };
  };
  notifications?: {
    explorerUrl: string;
    carbonWalletUrl: string;
    disabledEvents?: EventTypes[];
    regularGroupEvents?: EventTypes[];
    title: string;
    telegram: {
      botToken: string;
      bancorProtectionToken?: string;
      threads: {
        carbonThreadId?: number;
        fastlaneId?: number;
        vortexId?: number;
        bancorProtectionId?: number;
      };
    };
  };
}

export type LowercaseTokenMap = { [lowercaseAddress: string]: string };

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
          BancorArbitrageV2: {
            address: '0x0f54099D787e26c90c487625B4dE819eC5A9BDAA',
          },
          LiquidityProtectionStore: {
            address: '0xf5FAB5DBD2f3bf675dE4cB76517d4767013cfB55',
          },
        },
        notifications: {
          explorerUrl: this.configService.get('ETHEREUM_EXPLORER_URL'),
          carbonWalletUrl: this.configService.get('ETHEREUM_CARBON_WALLET_URL'),
          title: 'Ethereum',
          regularGroupEvents: [EventTypes.ProtectionRemovedEvent],
          telegram: {
            botToken: this.configService.get('ETHEREUM_TELEGRAM_BOT_TOKEN'),
            bancorProtectionToken: this.configService.get('ETHEREUM_BANCOR_PROTECTION_TOKEN'),
            threads: {
              carbonThreadId: this.configService.get('ETHEREUM_CARBON_THREAD_ID'),
              fastlaneId: this.configService.get('ETHEREUM_FASTLANE_THREAD_ID'),
              vortexId: this.configService.get('ETHEREUM_VORTEX_THREAD_ID'),
              bancorProtectionId: this.configService.get('ETHEREUM_BANCOR_PROTECTION_THREAD_ID'),
            },
          },
        },
      },
      {
        exchangeId: ExchangeId.OGSei,
        blockchainType: BlockchainType.Sei,
        rpcEndpoint: this.configService.get('SEI_RPC_ENDPOINT'),
        harvestEventsBatchSize: 500,
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
          BancorArbitrageV2: {
            address: '0xB2a2F14979A68C21181C6a63cA55a5b3693c9D2a',
          },
          CarbonVortex: {
            address: '0x5715203B16F15d7349Cb1E3537365E9664EAf933',
          },
        },
        mapEthereumTokens: {
          '0x9151434b16b9763660705744891fA906F660EcC5': '0xdac17f958d2ee523a2206206994597c13d831ec7', // usdt0
        },
        notifications: {
          explorerUrl: this.configService.get('SEI_EXPLORER_URL'),
          carbonWalletUrl: this.configService.get('SEI_CARBON_WALLET_URL'),
          title: 'Sei',
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
          BancorArbitrageV2: {
            address: '0x20216f3056BF98E245562940E6c9c65aD9B31271',
          },
          CarbonVortex: {
            address: '0xa15E3295465439A361dBcac79C1DBCE6Cd01E562',
          },
        },
        notifications: {
          explorerUrl: this.configService.get('CELO_EXPLORER_URL'),
          carbonWalletUrl: this.configService.get('CELO_CARBON_WALLET_URL'),
          title: 'Celo',
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
          name: 'Ether',
          symbol: 'ETH',
          address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        },
        nativeTokenAlias: '0x4300000000000000000000000000000000000004',
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
          BancorArbitrageV2: {
            address: '0x4A0c4eF72e0BA9d6A2d34dAD6E794378d9Ad4130',
          },
          CarbonVortex: {
            address: '0x0f54099D787e26c90c487625B4dE819eC5A9BDAA',
          },
        },
        notifications: {
          explorerUrl: this.configService.get('BLAST_EXPLORER_URL'),
          carbonWalletUrl: this.configService.get('BLAST_CARBON_WALLET_URL'),
          title: 'Blast',
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
        nativeTokenAlias: '0x4200000000000000000000000000000000000006',
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
          BancorArbitrageV2: {
            address: '0x31548B11d685a358de7f52978e099e04116B2Db0',
          },
          CarbonVortex: {
            address: '0xA4682A2A5Fe02feFF8Bd200240A41AD0E6EaF8d5',
          },
        },
        notifications: {
          explorerUrl: this.configService.get('BASE_EXPLORER_URL'),
          carbonWalletUrl: this.configService.get('BASE_GRAPHENE_WALLET_URL'),
          title: 'Graphene on Base',
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
      {
        exchangeId: ExchangeId.FantomGraphene,
        blockchainType: BlockchainType.Fantom,
        rpcEndpoint: this.configService.get('FANTOM_RPC_ENDPOINT'),
        harvestEventsBatchSize: 20000,
        harvestConcurrency: 10,
        multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
        startBlock: 69969086,
        gasToken: {
          name: 'Fantom',
          symbol: 'FTM',
          address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        },
        nativeTokenAlias: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
        contracts: {
          CarbonController: {
            address: '0xf37102e11E06276ac9D393277BD7b63b3393b361',
          },
          CarbonVoucher: {
            address: '0xf779D71178d96b5151D25DE608ac2Ab0558F6aA2',
          },
          BancorArbitrage: {
            address: '0xFe19CbA3aB1A189B7FC17cAa798Df64Ad2b54d4D',
          },
          CarbonVortex: {
            address: '0x4A0c4eF72e0BA9d6A2d34dAD6E794378d9Ad4130',
          },
        },
        notifications: {
          explorerUrl: this.configService.get('FANTOM_EXPLORER_URL'),
          carbonWalletUrl: this.configService.get('FANTOM_GRAPHENE_WALLET_URL'),
          title: 'Graphene on Fantom',
          telegram: {
            botToken: this.configService.get('FANTOM_TELEGRAM_BOT_TOKEN'),
            threads: {
              carbonThreadId: this.configService.get('FANTOM_CARBON_THREAD_ID'),
              fastlaneId: this.configService.get('FANTOM_FASTLANE_THREAD_ID'),
              vortexId: this.configService.get('FANTOM_VORTEX_THREAD_ID'),
            },
          },
        },
      },
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
          symbol: 'MNT',
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
          BancorArbitrageV2: {
            address: '0x63e353AE90f95C72bf1E78e45456fb78B0c97525',
          },
          CarbonVortex: {
            address: '0x59f21012B2E9BA67ce6a7605E74F945D0D4C84EA',
          },
        },
        notifications: {
          explorerUrl: this.configService.get('MANTLE_EXPLORER_URL'),
          carbonWalletUrl: this.configService.get('MANTLE_GRAPHENE_WALLET_URL'),
          title: 'Graphene on Mantle',
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
      {
        exchangeId: ExchangeId.MantleSupernova,
        blockchainType: BlockchainType.Mantle,
        rpcEndpoint: this.configService.get('MANTLE_RPC_ENDPOINT'),
        harvestEventsBatchSize: 20000,
        harvestConcurrency: 10,
        multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
        startBlock: 61955463,
        gasToken: {
          name: 'Mantle',
          symbol: 'MNT',
          address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        },
        nativeTokenAlias: '0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8',
        contracts: {
          CarbonController: {
            address: '0x04FBC7f949326fFf7Fe4D6aE96BAfa3D8e8A8c0a',
          },
          CarbonVoucher: {
            address: '0x6ed7042cc1ef691ef64d8dcf3764b004d62590dd',
          },
        },
        notifications: {
          explorerUrl: this.configService.get('MANTLE_EXPLORER_URL'),
          carbonWalletUrl: this.configService.get('MANTLE_SUPERNOVA_WALLET_URL'),
          title: 'Supernova on Mantle',
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
      {
        exchangeId: ExchangeId.LineaXFai,
        blockchainType: BlockchainType.Linea,
        rpcEndpoint: this.configService.get('LINEA_RPC_ENDPOINT'),
        harvestEventsBatchSize: 20000,
        harvestConcurrency: 10,
        multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
        startBlock: 5242975,
        gasToken: {
          name: 'ETH',
          symbol: 'ETH',
          address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        },
        nativeTokenAlias: '0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f',
        contracts: {
          CarbonController: {
            address: '0xdebc64044cd911b0cc90dcc94bf97f440eb5e503',
          },
          CarbonVoucher: {
            address: '0x3dae488DcB2835c43E71557E7745b838Dc7e46DD',
          },
          BancorArbitrage: {
            address: '0xC7Dd38e64822108446872c5C2105308058c5C55C',
          },
          BancorArbitrageV2: {
            address: '0x37A65Dda75A4C32959834C9b391a24dCa17eeC10',
          },
          CarbonVortex: {
            address: '0x5bCA3389786385a35bca14C2D0582adC6cb2482e',
          },
        },
        notifications: {
          explorerUrl: this.configService.get('LINEA_EXPLORER_URL'),
          carbonWalletUrl: this.configService.get('LINEA_XFAI_WALLET_URL'),
          disabledEvents: [EventTypes.TokensTradedEvent, EventTypes.StrategyCreatedEvent],
          title: 'XFai on Linea',
          telegram: {
            botToken: this.configService.get('LINEA_TELEGRAM_BOT_TOKEN'),
            threads: {
              carbonThreadId: this.configService.get('LINEA_CARBON_THREAD_ID'),
              fastlaneId: this.configService.get('LINEA_FASTLANE_THREAD_ID'),
              vortexId: this.configService.get('LINEA_VORTEX_THREAD_ID'),
            },
          },
        },
      },
      {
        exchangeId: ExchangeId.BaseAlienBase,
        blockchainType: BlockchainType.Base,
        rpcEndpoint: this.configService.get('BASE_RPC_ENDPOINT'),
        harvestEventsBatchSize: 20000,
        harvestConcurrency: 10,
        multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
        startBlock: 18342064,
        gasToken: {
          name: 'Ether',
          symbol: 'ETH',
          address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        },
        nativeTokenAlias: '0x4200000000000000000000000000000000000006',
        contracts: {
          CarbonController: {
            address: '0x0D6E297A73016b437CaAE65BFe32c59803B215D0',
          },
          CarbonVoucher: {
            address: '0x2f3B0d35830B921FE7FcD08401C6CBBe29a72DC9',
          },
        },
        notifications: {
          explorerUrl: this.configService.get('BASE_EXPLORER_URL'),
          carbonWalletUrl: '',
          title: 'AlienBase',
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
      {
        exchangeId: ExchangeId.BerachainGraphene,
        blockchainType: BlockchainType.Berachain,
        rpcEndpoint: this.configService.get('BERACHAIN_RPC_ENDPOINT'),
        harvestEventsBatchSize: 1000,
        harvestConcurrency: 3,
        multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
        startBlock: 1377587,
        gasToken: {
          name: 'Ether',
          symbol: 'ETH',
          address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        },
        nativeTokenAlias: '0x6969696969696969696969696969696969696969',
        contracts: {
          CarbonController: {
            address: '0x10fa549e70ede76c258c0808b289e4ac3c9ab2e2',
          },
          CarbonVoucher: {
            address: '0x248594Be9BE605905B8912cf575f03fE42d89054',
          },
          BancorArbitrage: {
            address: '0xC7Dd38e64822108446872c5C2105308058c5C55C',
          },
          BancorArbitrageV2: {
            address: '0x773B75CfB146bd5d1095fa9d6d45637f02B05119',
          },
        },
        notifications: {
          explorerUrl: this.configService.get('BERACHAIN_EXPLORER_URL'),
          carbonWalletUrl: this.configService.get('BERACHAIN_WALLET_URL'),
          title: 'Berachain',
          telegram: {
            botToken: this.configService.get('BERACHAIN_TELEGRAM_BOT_TOKEN'),
            threads: {
              fastlaneId: this.configService.get('BERACHAIN_FASTLANE_THREAD_ID'),
            },
          },
        },
      },
      {
        exchangeId: ExchangeId.OGCoti,
        blockchainType: BlockchainType.Coti,
        rpcEndpoint: this.configService.get('COTI_RPC_ENDPOINT'),
        harvestEventsBatchSize: 1000,
        harvestConcurrency: 3,
        multicallAddress: '0x773B75CfB146bd5d1095fa9d6d45637f02B05119',
        startBlock: 47878,
        gasToken: {
          name: 'COTI',
          symbol: 'COTI',
          address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        },
        nativeTokenAlias: '0xDDB3422497E61e13543BeA06989C0789117555c5',
        contracts: {
          CarbonController: {
            address: '0x59f21012B2E9BA67ce6a7605E74F945D0D4C84EA',
          },
          CarbonVoucher: {
            address: '0xA4682A2A5Fe02feFF8Bd200240A41AD0E6EaF8d5',
          },
          BancorArbitrage: {
            address: '0xa15E3295465439A361dBcac79C1DBCE6Cd01E562',
          },
          BancorArbitrageV2: {
            address: '0x2ec4cCAA4394633eCdCcc987E0E9A398F837e3DD',
          },
        },
        notifications: {
          explorerUrl: this.configService.get('COTI_EXPLORER_URL'),
          carbonWalletUrl: this.configService.get('COTI_WALLET_URL'),
          title: 'Coti',
          telegram: {
            botToken: this.configService.get('COTI_TELEGRAM_BOT_TOKEN'),
            threads: {
              carbonThreadId: this.configService.get('COTI_CARBON_THREAD_ID'),
              fastlaneId: this.configService.get('COTI_FASTLANE_THREAD_ID'),
            },
          },
        },
        mapEthereumTokens: {
          '0xDDB3422497E61e13543BeA06989C0789117555c5': '0xDDB3422497E61e13543BeA06989C0789117555c5', // coti
          '0x7637c7838ec4ec6b85080f28a678f8e234bb83d1': '0xaf2ca40d3fc4459436d11b94d21fa4b8a89fb51d', // gcoti
          '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee': '0xDDB3422497E61e13543BeA06989C0789117555c5', // native token (coti)
          '0xf1Feebc4376c68B7003450ae66343Ae59AB37D3C': '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // usdc.e
          '0x639acc80569c5fc83c6fbf2319a6cc38bbfe26d1': '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // weth
          '0x8c39b1fd0e6260fdf20652fc436d25026832bfea': '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', // usdc.e
        },
      },
      {
        exchangeId: ExchangeId.IotaGraphene,
        blockchainType: BlockchainType.Iota,
        rpcEndpoint: this.configService.get('IOTA_RPC_ENDPOINT'),
        harvestEventsBatchSize: 1000,
        harvestConcurrency: 1,
        multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
        startBlock: 1936296,
        gasToken: {
          name: 'IOTA',
          symbol: 'IOTA',
          address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        },
        nativeTokenAlias: '0x6e47f8d48a01b44DF3fFF35d258A10A3AEdC114c',
        contracts: {
          CarbonController: {
            address: '0x0E4d23092A4a12caAd0E22e0892EcEC7C09DC51c',
          },
          CarbonVoucher: {
            address: '0xCB66807CE7a762F469aeb1478c09a6DAfEcB801C',
          },
          BancorArbitrage: {
            address: '0xC7Dd38e64822108446872c5C2105308058c5C55C',
          },
          BancorArbitrageV2: {
            address: '0xeAA4368A09E5e7889C6Ae3D44A7F5eb8587a456c',
          },
          Vortex: {
            address: '0xe4816658ad10bF215053C533cceAe3f59e1f1087',
          },
        },
        notifications: {
          explorerUrl: this.configService.get('IOTA_EXPLORER_URL'),
          carbonWalletUrl: this.configService.get('IOTA_CARBON_WALLET_URL'),
          title: 'IOTA',
          telegram: {
            botToken: this.configService.get('IOTA_TELEGRAM_BOT_TOKEN'),
            threads: {
              fastlaneId: this.configService.get('IOTA_FASTLANE_THREAD_ID'),
            },
          },
        },
      },
      {
        exchangeId: ExchangeId.OGTac,
        blockchainType: BlockchainType.Tac,
        rpcEndpoint: this.configService.get('TAC_RPC_ENDPOINT'),
        harvestEventsBatchSize: 1000,
        harvestConcurrency: 1,
        multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
        startBlock: 975648,
        gasToken: {
          name: 'TAC',
          symbol: 'TAC',
          address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        },
        nativeTokenAlias: '0xB63B9f0eb4A6E6f191529D71d4D88cc8900Df2C9',
        contracts: {
          CarbonController: {
            address: '0xA4682A2A5Fe02feFF8Bd200240A41AD0E6EaF8d5',
          },
          CarbonVoucher: {
            address: '0xb0d39990E1C38B50D0b7f6911525535Fbacb4C26',
          },
          BancorArbitrageV2: {
            address: '0x51aA24A9230e62CfaF259c47DE3133578cE36317',
          },
        },
        mapEthereumTokens: {
          '0xb76d91340f5ce3577f0a056d29f6e3eb4e88b140': '0x582d872a1b094fc48f5de31d3b73f2d9be47def1', // ton -> wtoncoin
          '0xaf988c3f7cb2aceabb15f96b19388a259b6c438f': '0xdac17f958d2ee523a2206206994597c13d831ec7', // usdt
        },
        // notifications: {
        //   explorerUrl: this.configService.get('TAC_EXPLORER_URL'),
        //   carbonWalletUrl: this.configService.get('TAC_CARBON_WALLET_URL'),
        //   title: 'TAC',
        //   telegram: {
        //     botToken: this.configService.get('TAC_TELEGRAM_BOT_TOKEN'),
        //     threads: {
        //       carbonThreadId: this.configService.get('TAC_CARBON_THREAD_ID'),
        //       fastlaneId: this.configService.get('TAC_FASTLANE_THREAD_ID'),
        //     },
        //   },
        // },
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
      throw new Error(`Deployment not found for blockchain type: ${blockchainType}`);
    }
    return deployment;
  }

  getLowercaseTokenMap(deployment: Deployment): LowercaseTokenMap {
    if (!deployment.mapEthereumTokens) {
      return {};
    }

    return Object.entries(deployment.mapEthereumTokens).reduce((acc, [key, value]) => {
      acc[key.toLowerCase()] = value.toLowerCase();
      return acc;
    }, {});
  }
}

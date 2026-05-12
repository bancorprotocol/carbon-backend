import { BlockchainType, ExchangeId } from '../deployment/deployment.service';

export interface NetworkMapping {
  chainId: number;
  exchangeId: ExchangeId;
  blockchainType: BlockchainType;
  rpcEnvVar: string;
  wssEnvVar: string;
  name: string;
}

export const NETWORK_MAPPINGS: NetworkMapping[] = [
  {
    chainId: 1,
    exchangeId: ExchangeId.OGEthereum,
    blockchainType: BlockchainType.Ethereum,
    rpcEnvVar: 'ETHEREUM_RPC_ENDPOINT',
    wssEnvVar: 'ETHEREUM_WSS_ENDPOINT',
    name: 'Ethereum',
  },
  {
    chainId: 1329,
    exchangeId: ExchangeId.OGSei,
    blockchainType: BlockchainType.Sei,
    rpcEnvVar: 'SEI_RPC_ENDPOINT',
    wssEnvVar: 'SEI_WSS_ENDPOINT',
    name: 'Sei',
  },
  {
    chainId: 42220,
    exchangeId: ExchangeId.OGCelo,
    blockchainType: BlockchainType.Celo,
    rpcEnvVar: 'CELO_RPC_ENDPOINT',
    wssEnvVar: 'CELO_WSS_ENDPOINT',
    name: 'Celo',
  },
  {
    chainId: 2632500,
    exchangeId: ExchangeId.OGCoti,
    blockchainType: BlockchainType.Coti,
    rpcEnvVar: 'COTI_RPC_ENDPOINT',
    wssEnvVar: 'COTI_WSS_ENDPOINT',
    name: 'Coti',
  },
];

export function getNetworkMapping(chainId: number): NetworkMapping | undefined {
  return NETWORK_MAPPINGS.find((m) => m.chainId === chainId);
}

export const PREVIEW_APP_PREFIX = 'carbon-prev';
export const PREVIEW_MAX_AGE_HOURS = 48;
// A preview that has not become healthy within this many minutes of creation
// is considered abandoned and gets flipped to `error` so the cleanup cron can
// reap it instead of the reconciler churning against GCE forever. Tuned to be
// generous enough for cold COS image pulls (~5min) plus the carbon container
// boot + health-up time on a slow network.
export const PREVIEW_ABANDON_AFTER_MINUTES = 15;

export const TENDERLY_API_BASE = 'https://api.tenderly.co/api/v1';

export const GCE_PROJECT = 'bancor-api';
export const GCE_ZONE = 'europe-west2-b';
export const GCE_MACHINE_TYPE = 'e2-custom-2-4096';
export const GCE_NETWORK_TAG = 'preview-backend';
export const GCE_COS_IMAGE_PROJECT = 'cos-cloud';
export const GCE_COS_IMAGE_FAMILY = 'cos-stable';

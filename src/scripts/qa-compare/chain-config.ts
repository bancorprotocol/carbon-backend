/**
 * Static metadata per chain: maps the URL exchangeId segment to the prod DB
 * (`blockchainType`, `exchangeId`) tuple plus the CarbonController contract
 * address used to construct gecko-terminal pair ids (`<controller>-<pairId>`).
 *
 * Mirrors the deployment definitions in src/deployment/deployment.service.ts.
 */
export interface ChainConfig {
  exchangeId: string; // value as stored in DB (`exchangeId` column)
  blockchainType: string; // value as stored in DB (`blockchainType` column)
  carbonController: string; // contract address, lowercase
}

const RAW: Array<ChainConfig> = [
  { exchangeId: 'ethereum', blockchainType: 'ethereum', carbonController: '0xc537e898cd774e2dcba3b14ea6f34c93d5ea45e1' },
  { exchangeId: 'sei', blockchainType: 'sei-network', carbonController: '0xe4816658ad10bf215053c533cceae3f59e1f1087' },
  { exchangeId: 'celo', blockchainType: 'celo', carbonController: '0x6619871118d144c1c28ec3b23036fc1f0829ed3a' },
  {
    exchangeId: 'base-graphene',
    blockchainType: 'base',
    carbonController: '0xfbf069dbbf453c1ab23042083cfa980b3a672bba',
  },
  {
    exchangeId: 'mantle-graphene',
    blockchainType: 'mantle',
    carbonController: '0x7900f766f06e361fddb4fdebac5b138c4eed8d4a',
  },
  {
    exchangeId: 'mantle-supernova',
    blockchainType: 'mantle',
    carbonController: '0x04fbc7f949326fff7fe4d6ae96bafa3d8e8a8c0a',
  },
  {
    exchangeId: 'linea-xfai',
    blockchainType: 'linea',
    carbonController: '0xdebc64044cd911b0cc90dcc94bf97f440eb5e503',
  },
  {
    exchangeId: 'base-alienbase',
    blockchainType: 'base',
    carbonController: '0x0d6e297a73016b437caae65bfe32c59803b215d0',
  },
  {
    exchangeId: 'berachain-graphene',
    blockchainType: 'berachain',
    carbonController: '0x10fa549e70ede76c258c0808b289e4ac3c9ab2e2',
  },
  { exchangeId: 'coti', blockchainType: 'coti', carbonController: '0x59f21012b2e9ba67ce6a7605e74f945d0d4c84ea' },
  { exchangeId: 'tac', blockchainType: 'tac', carbonController: '0xa4682a2a5fe02feff8bd200240a41ad0e6eaf8d5' },
];

const BY_EXCHANGE_ID = new Map<string, ChainConfig>(RAW.map((r) => [r.exchangeId, r]));

export function getChainConfig(exchangeId: string): ChainConfig | null {
  return BY_EXCHANGE_ID.get(exchangeId) ?? null;
}

export const ALL_CHAIN_CONFIGS = RAW;

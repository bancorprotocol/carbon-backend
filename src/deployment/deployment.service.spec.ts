import { ConfigService } from '@nestjs/config';
import { DeploymentService, ExchangeId } from './deployment.service';

describe('DeploymentService Sei price anchors', () => {
  function seiMap(): Record<string, string> {
    const configService = { get: () => undefined } as unknown as ConfigService;
    const service = new DeploymentService(configService);
    return service.getLowercaseTokenMap(service.getDeploymentByExchangeId(ExchangeId.OGSei));
  }

  it('prices liquid USDC, WETH, and WBTC from Ethereum, not from Codex', () => {
    const map = seiMap();
    expect(map['0xe15fc38f6d8c56af07bbcbe3baf5708a2bf42392']).toBe('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
    expect(map['0x160345fc359604fc6e70e3c5facbde5f7a9342d8']).toBe('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2');
    expect(map['0xdf26208d8e2d7ead3ef4e9a5a3cad8a3c9143934']).toBe('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2');
    expect(map['0x0555e30da8f98308edb960aa94c0db47230d2b9c']).toBe('0x2260fac5e5542a773aa44fbcfedf7c193bc2c599');
  });

  it('does not force the thin USDT.kava token onto Ethereum USDT', () => {
    const map = seiMap();
    expect(map['0xb75d0b03c06a926e488e2659df1a861f860bd3d1']).toBeUndefined();
  });
});

describe('DeploymentService.resolveWssEndpoint', () => {
  function makeService(env: Record<string, string | undefined>): DeploymentService {
    const configService = {
      get: (key: string) => env[key],
    } as unknown as ConfigService;
    return new DeploymentService(configService);
  }

  function getEthereumWss(env: Record<string, string | undefined>): string | undefined {
    const service = makeService({
      ...env,
      PREVIEW_DEPLOYMENT: ExchangeId.OGEthereum,
    });
    return service.getDeploymentByExchangeId(ExchangeId.OGEthereum).wssEndpoint;
  }

  it('uses the explicit WSS env var when set', () => {
    expect(
      getEthereumWss({
        ETHEREUM_WSS_ENDPOINT: 'wss://explicit.example.com',
        ETHEREUM_RPC_ENDPOINT: 'https://rpc.example.com',
      }),
    ).toBe('wss://explicit.example.com');
  });

  it('derives wss:// from https:// rpc when WSS env is missing', () => {
    expect(
      getEthereumWss({
        ETHEREUM_RPC_ENDPOINT: 'https://eth-mainnet.example.com/v2/key',
      }),
    ).toBe('wss://eth-mainnet.example.com/v2/key');
  });

  it('falls through to derivation when WSS env is an empty string', () => {
    expect(
      getEthereumWss({
        ETHEREUM_WSS_ENDPOINT: '',
        ETHEREUM_RPC_ENDPOINT: 'https://eth-mainnet.example.com',
      }),
    ).toBe('wss://eth-mainnet.example.com');
  });

  it('returns undefined for non-https rpc (e.g. http://)', () => {
    expect(
      getEthereumWss({
        ETHEREUM_RPC_ENDPOINT: 'http://localhost:8545',
      }),
    ).toBeUndefined();
  });

  it('returns undefined when both env vars are missing', () => {
    expect(getEthereumWss({})).toBeUndefined();
  });

  it('only swaps the protocol prefix, leaving the rest of the URL intact', () => {
    expect(
      getEthereumWss({
        ETHEREUM_RPC_ENDPOINT: 'https://api.foo.com/rpc/v1/abc',
      }),
    ).toBe('wss://api.foo.com/rpc/v1/abc');
  });
});

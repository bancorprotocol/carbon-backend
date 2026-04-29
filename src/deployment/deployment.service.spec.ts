import { ConfigService } from '@nestjs/config';
import { DeploymentService, ExchangeId } from './deployment.service';

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

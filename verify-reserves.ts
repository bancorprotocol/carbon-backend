import { execSync } from 'child_process';

async function verifyReserves() {
  console.log('=== Verifying Reserves Calculation ===');

  const fromBlock = 22761543;
  const toBlock = 22766543;

  console.log(`Testing block range: ${fromBlock} to ${toBlock}`);

  try {
    // Run the dex-screener v2 service to get results
    const command = `node -e "
      const { NestFactory } = require('@nestjs/core');
      const { AppModule } = require('./dist/src/app.module');
      const { DexScreenerV2Service } = require('./dist/v1/dex-screener/dex-screener-v2.service');
      
      async function test() {
        const app = await NestFactory.createApplicationContext(AppModule);
        const service = app.get(DexScreenerV2Service);
        
        const deployment = {
          exchangeId: 'ethereum',
          blockchainType: 'ethereum',
          rpcEndpoint: 'https://eth-mainnet.g.alchemy.com/v2/demo',
          harvestEventsBatchSize: 10000,
          harvestConcurrency: 1,
          multicallAddress: '0x5ba1e12693dc8f9c48aad8770482f4739beed696',
          startBlock: 17087776,
          gasToken: {
            name: 'Ethereum',
            symbol: 'ETH',
            address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          },
          contracts: {
            CarbonController: {
              address: '0xC537e898CD774e2dCBa3B14Ea6f34C93d5eA45e1',
            },
          },
        };
        
        const events = await service.getEvents(${fromBlock}, ${toBlock}, deployment);
        const swapEvents = events.filter(e => e.eventType === 'swap');
        
        console.log(JSON.stringify(swapEvents.map(e => ({
          pairId: e.pairId,
          txnId: e.txnId,
          reserves0: e.reserves0,
          reserves1: e.reserves1
        })), null, 2));
        
        await app.close();
      }
      
      test().catch(console.error);
    "`;

    const result = execSync(command, { encoding: 'utf8', cwd: process.cwd() });
    console.log('Results:', result);

    // Expected results
    const expectedResults = {
      '0xbc543d448520ea7b45aff13a95a261a1a55d20b438f22236d8fc9fb005763b06': {
        pairId: '7',
        reserves: { asset0: 321806.757093028, asset1: 45688.3321829997 },
      },
      '0xf9c6d2395c8925cb22b433f240e4bf167ef1840bc272771c7224bea28982c2fa': {
        pairId: '1890',
        reserves: { asset0: 45787.0692739997, asset1: 0.141282 },
      },
      '0x6bab636dd655a95c9e68367e182d87ec81cbc8695d6d6c467b729b938fe5d4b0': {
        pairId: '3',
        reserves: { asset0: 5014.62575000001, asset1: 12600.982021 },
      },
    };

    console.log('\nExpected results:');
    console.log(JSON.stringify(expectedResults, null, 2));
  } catch (error) {
    console.error('Error running verification:', error);
  }
}

if (require.main === module) {
  verifyReserves().catch(console.error);
}

export { verifyReserves };

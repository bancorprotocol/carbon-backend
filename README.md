# Carbon Backend

Carbon Backend, built with [Nest.js](https://nestjs.com), serves as a specialized backend solution for aggregating insights from Carbon smart contracts and delivering them through APIs. It provides a suite of APIs offering valuable insights, such as trading activity and history.

## Prerequisites

Before setting up Carbon Backend, ensure you have the following prerequisites:

- **[TimescaleDB](https://docs.timescale.com/self-hosted/latest/install)**: Ensure TimescaleDB is properly installed and running.
- **[Redis](https://redis.io/docs/install/install-stack)**: Ensure Redis is properly installed and running.
- **[CoinGecko](https://www.coingecko.com/en/api)**: Obtain an API key from CoinGecko.
  - This repo is set up to use Coingecko's PRO API, if you have a free plan you will need to adjust the coingecko api url and authentication header.
- **[CoinMarketCap](https://www.coingecko.com/en/api)**: Obtain an API key from CoinMarketCap.
- **[Codex](https://www.codex.io/)**: Obtain an API key from Codex.
- **Python 3 (Optional)**: Required for the simulator.

## Installation

To set up Carbon Backend, follow these steps:

1. Clone the repository:

   ```bash
   git clone https://github.com/bancorprotocol/carbon-backend
   ```

2. Navigate to the project directory:

   ```bash
   cd carbon-backend
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. **Run database migrations**:

   After installing dependencies, run the following command to execute all migrations and prepare the database:

   ```bash
   npm run migration:run
   ```

5. Configure environment variables:

   Duplicate the `.env.example` file as `.env`:

   ```bash
   cp .env.example .env
   ```

   Provide the required values in the `.env` file.

6. (Optional) If you wish to utilize the simulator feature, install the required Python packages:

   ```bash
   pip install -r src/simulator/requirements.txt
   ```

## Usage

To run Carbon Backend:

```bash
npm start
```

## First run

On the first run, the application will sync each network to current state. This will heavily consume the RPC API urls, if you're using a free plan from Alchemy or another provider, you might be rate limited and the sync process will take some time.

If you're facing network issues when syncing the chain state, try reducing the parameters `harvestEventsBatchSize` and `harvestConcurrency` for each network in the deployment config on `deployment.service.ts`. This will slow down the sync, but will be lighter on your network. 

## API Documentation

Access the API documentation by navigating to [http://localhost:3000](http://localhost:3000) in your browser.

## Seed Historic Quotes (Optional)

Manually run the `seed` function in `src/historic-quote/historic-quote.service.ts` to populate the database with historic quotes for history-dependent functionalities such as the simulator.

## Change Network

To switch Carbon Backend's network for different deployments, follow these steps:

1. **Replace Smart Contract Files**:

   - Replace files in `src/contracts/mainnet` with those from the new deployment.

2. **Modify CoinMarketCap Service**:

   - Adjust `src/coinmarketcap/coinmarketcap.service.ts` to align with the new network.
   - For guidance, check the [CoinMarketCap API documentation](https://coinmarketcap.com/api/documentation/v1/).

3. **Modify CoinGecko Service**:

   - Adjust `src/quote/coingecko.service.ts` to match the requirements of the new network.
   - Refer to the [CoinGecko API documentation](https://docs.coingecko.com/) for assistance.

4. **Customizing Networks and Exchange IDs**:

   To configure which networks are supported by Carbon Backend, make the following changes in `deployment.service.ts` and `exchange-id-param.decorator.ts`.

   ### Supporting Multiple Networks

   If you want to support multiple networks, update the following:

   - **In `deployment.service.ts`**:

     - Update the `BlockchainType` and `ExchangeId` enums to reflect the networks you want to support:

       ```typescript
       export enum BlockchainType {
         Ethereum = 'ethereum',
         Sei = 'sei-network',
         Celo = 'celo',
         Blast = 'blast',
         // Add or remove entries as needed
       }

       export enum ExchangeId {
         OGEthereum = 'ethereum',
         OGSei = 'sei',
         OGCelo = 'celo',
         OGBlast = 'blast',
         // Add or remove entries as needed
       }
       ```

     - Modify `initializeDeployments` with configuration for each network, including `exchangeId`, `blockchainType`, `rpcEndpoint`, and other network-specific values:

       ```typescript
       private initializeDeployments(): Deployment[] {
         return [
           {
             exchangeId: ExchangeId.OGEthereum,
             blockchainType: BlockchainType.Ethereum,
             rpcEndpoint: this.configService.get('ETHEREUM_RPC_ENDPOINT'),
             harvestEventsBatchSize: 2000000,
             harvestConcurrency: 10,
             multicallAddress: '0x5Eb3fa2DFECdDe21C950813C665E9364fa609bD2',
             startBlock: 17087000,
             gasToken: {
               name: 'Ethereum',
               symbol: 'ETH',
               address: NATIVE_TOKEN,
             },
           },
           // Repeat this block for each network
         ];
       }
       ```

   - **In `exchange-id-param.decorator.ts`**:

     - Adjust `extractExchangeId` to support dynamic handling for multiple networks:

       ```typescript
       export function extractExchangeId(request: Request, exchangeIdParam?: string): ExchangeId {
         let exchangeId: ExchangeId;

         if (exchangeIdParam) {
           exchangeId = exchangeIdParam as ExchangeId;
         } else {
           let subdomain = request.hostname.split('.')[0];
           if (subdomain.endsWith('-api')) {
             subdomain = subdomain.slice(0, -4); // Remove '-api' suffix
           }
           if (subdomain === 'api') {
             subdomain = ExchangeId.OGEthereum; // Adjust to your preferred default network
           }
           exchangeId = subdomain ? (subdomain as ExchangeId) : (ExchangeId.OGEthereum as ExchangeId);
         }

         if (!Object.values(ExchangeId).includes(exchangeId)) {
           throw new Error(`Invalid ExchangeId: ${exchangeId}`);
         }

         return exchangeId;
       }
       ```

   ### Supporting a Single Network

   If supporting only one network, simplify the configuration:

   - **In `deployment.service.ts`**:

     - Set a single `BlockchainType` and `ExchangeId`, and configure `initializeDeployments` for only that network.

   - **In `exchange-id-param.decorator.ts`**:

     - Hardcode the `extractExchangeId` function to return only the supported `ExchangeId`:

       ```typescript
       export function extractExchangeId(request: Request, exchangeIdParam?: string): ExchangeId {
         const exchangeId = ExchangeId.OGEthereum; // Replace with the single supported ExchangeId

         if (exchangeIdParam && exchangeIdParam !== exchangeId) {
           throw new Error(`Unsupported ExchangeId: only ${exchangeId} is allowed`);
         }

         return exchangeId;
       }
       ```

## Entity Relationship Diagram (ERD)

Carbon Backend provides a command to automatically generate an Entity Relationship Diagram (ERD) from your TypeORM entities. This helps visualize the database structure and relationships between entities.

To generate the ERD:

```bash
npm run generate-erd
```

This command:

1. Scans all TypeORM entity files
2. Generates a Mermaid diagram definition
3. Creates two files:
   - `erd.mmd`: The Mermaid diagram definition file
   - `erd.svg`: The rendered diagram in SVG format

The diagram includes:

- All entities with their properties
- Property types
- Primary key indicators
- Relationships between entities (one-to-one, one-to-many, many-to-many)

## License

Carbon Backend is licensed under the [MIT License](LICENSE).
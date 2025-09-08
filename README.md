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

7. (Optional) Database Seeding:

   If you need to import data from an external database, you can use the seeding script:

   a. Configure the database connection variables in your `.env` file:

   ```env
   # External Database Configuration
   EXTERNAL_DATABASE_USERNAME=username
   EXTERNAL_DATABASE_PASSWORD=password
   EXTERNAL_DATABASE_HOST=host
   EXTERNAL_DATABASE_NAME=database_name

   # Local Database Configuration
   DATABASE_NAME=local_db_name
   DATABASE_USERNAME=username
   DATABASE_HOST=localhost
   DATABASE_PASSWORD=password
   ```

   b. Run the seeding script:

   ```bash
   npm run db:seed
   ```

   This will import the database structure and data from the external database to your local database, excluding certain tables as configured in the seed script.

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

## Notifications System

The Carbon Backend includes a notification system that sends alerts to Telegram channels.

### Configuration and Setup

Configure the notification system in your `.env` file:

```bash
# Telegram Configuration
TELEGRAM_CHAT_ID=your-chat-id

# Google Cloud Tasks Configuration
QUEUE_NAME=bancor-alerts
QUEUE_LOCATION=europe-west2
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
GOOGLE_CLOUD_PROJECT=your-project-id
API_URL=https://your-api-url.com

# Network-Specific Thread IDs
ETHEREUM_TELEGRAM_BOT_TOKEN=your-bot-token
ETHEREUM_CARBON_THREAD_ID=123
ETHEREUM_FASTLANE_THREAD_ID=456
ETHEREUM_VORTEX_THREAD_ID=789

# Explorer URLs (for transaction links)
ETHEREUM_EXPLORER_URL=https://etherscan.io/tx/
ETHEREUM_WALLET_URL=https://app.carbondefi.xyz/wallet/
```

### Modifying Existing Notifications

1. **Locate Format Function**
   In `TelegramService`, find the corresponding format function:

   ```typescript
   private async formatExistingEventMessage(
     event: ExistingEvent,
     tokens: TokensByAddress,
     quotes: QuotesByAddress,
     deployment: Deployment,
   ): Promise<string> {
     // Modify the message format here
     return `Your modified message format`;
   }
   ```

2. **Helper Methods Available**
   - `amountToken(amount: string, precision: number, token: Token)`: Format token amounts
   - `amountUSD(amount: string, precision: number, usdPrice: string, token: Token)`: Format USD amounts
   - `getUsdRate(tokenAddress: string, quotes: QuotesByAddress, deployment: Deployment)`: Get token USD rate
   - `printNumber(num: number, precision: number)`: Format numbers with precision

### Adding New Event Notifications

1. **Update Event Types**

   ```typescript
   // In src/events/event-types.ts
   export enum EventTypes {
     YourNewEvent = 'YourNewEvent',
     // ... other events
   }
   ```

2. **Add Format Function**

   ```typescript
   private async formatYourNewEventMessage(
     event: YourNewEvent,
     tokens: TokensByAddress,
     quotes: QuotesByAddress,
     deployment: Deployment,
   ): Promise<string> {
     return `New Event: ${event.name}
   Transaction: ${deployment.notifications.explorerUrl}${event.transactionHash}`;
   }
   ```

3. **Register in Switch Statement**

   ```typescript
   switch (eventType) {
     case EventTypes.YourNewEvent:
       message = await this.formatYourNewEventMessage(event, tokens, quotes, deployment);
       threadId = deployment.notifications.telegram.threads.yourThreadId;
       break;
   }
   ```

4. **Register Services**

   ```typescript
   // In NotificationService
   private registerEventServices() {
     this.eventServices.set(EventTypes.YourNewEvent, this.yourEventService);
   }

   // In NotificationController
   this.eventServiceMap = new Map([
     [EventTypes.YourNewEvent, yourEventService],
   ]);
   ```

5. **Configure Thread IDs**

   ```bash
   # In .env
   ETHEREUM_YOUR_THREAD_ID=123

   ```

### How It Works

1. `NotificationService` processes events in batches from the blockchain
2. For each event found, it creates a task in Google Cloud Tasks queue
3. Tasks trigger the `/notifications/telegram` endpoint
4. `NotificationController` retrieves the event data and passes it to `TelegramService`
5. `TelegramService` formats the message based on event type and sends it to the appropriate Telegram thread

This system ensures reliable delivery of notifications even with high event volumes and provides network-specific configuration options.

## Merkl Rewards System

Carbon Backend includes a sophisticated Merkl rewards processing system that distributes incentives to liquidity providers based on their strategy positions and market conditions. This system is designed to handle financial reward distribution with strict accuracy and temporal consistency requirements.

### Overview

The Merkl rewards system implements an epoch-based reward distribution algorithm that:

- **Processes campaigns in chronological epochs** to ensure temporal consistency
- **Maintains strategy state isolation** to prevent cross-contamination between time periods
- **Calculates reward eligibility** based on liquidity proximity to market prices
- **Applies configurable token weightings** to incentivize specific assets
- **Enforces campaign budget limits** with automatic proportional scaling
- **Uses deterministic processing** for reproducible results

### Environment Variables

#### Required for Production

```bash
# REQUIRED: Security salt for deterministic seed generation
MERKL_SNAPSHOT_SALT=your-secret-salt-for-merkl-seed-generation
```

**⚠️ Critical**: The `MERKL_SNAPSHOT_SALT` is required for secure seed generation in production. This salt ensures:

- **Deterministic results**: Same input data always produces the same rewards
- **Security**: Prevents manipulation of reward calculations through predictable randomness
- **Reproducibility**: Enables audit and verification of reward distributions

#### Optional for Testing/Development

```bash
# OPTIONAL: Fixed seed for testing environments
MERKL_SNAPSHOT_SEED=fixed-test-seed-12345
```

**Use Cases for Environment Variables:**

| Variable              | Environment             | Purpose                              | When to Use                       |
| --------------------- | ----------------------- | ------------------------------------ | --------------------------------- |
| `MERKL_SNAPSHOT_SALT` | **Production**          | Secure deterministic seed generation | **Always required in production** |
| `MERKL_SNAPSHOT_SEED` | **Testing/Development** | Fixed seed for reproducible tests    | Only for testing and development  |

**⚠️ Important**: Never use `MERKL_SNAPSHOT_SEED` in production as it overrides the secure transaction-based seed generation.

### Campaign Management

#### Creating Campaigns

**⚠️ Critical**: Campaigns must be created directly in the database using SQL. There is no API endpoint for campaign creation to ensure data integrity.

Example campaign creation:

```sql
INSERT INTO merkl_campaigns (
    "blockchainType",
    "exchangeId",
    "pairId",
    "rewardAmount",
    "rewardTokenAddress",
    "startDate",
    "endDate",
    "opportunityName",
    "isActive"
) VALUES (
    'ethereum',
    'ethereum',
    123,
    '1000', -- 1000 USDT tokens
    '0xdAC17F958D2ee523a2206206994597C13D831ec7', -- USDT token
    '2024-01-01 00:00:00',
    '2024-01-31 23:59:59',
    'Ethereum Liquidity Incentives',
    true
);
```

**Required Campaign Fields:**

- `blockchainType`: Must match deployment configuration
- `exchangeId`: Must match deployment configuration
- `pairId`: Valid pair ID from the pairs table
- `rewardAmount`: Total reward budget in token units (e.g., "100" for 100 tokens)
- `rewardTokenAddress`: Contract address of the reward token
- `startDate`/`endDate`: Campaign duration (must not overlap with existing campaigns for same pair)
- `opportunityName`: Human-readable campaign description
- `isActive`: Should be `true` for active campaigns

#### Campaign Lifecycle Rules

**⚠️ Critical Merkl Requirements:**

1. **Never Cancel Active Campaigns**: Once a campaign has started processing, it must not be cancelled or modified as per Merkl's requirements
2. **Complete Campaign Duration**: Allow campaigns to run their full scheduled duration
3. **No Overlapping Campaigns**: Ensure only one active campaign per pair at any time
4. **Budget Enforcement**: The system automatically enforces campaign budget limits

### Token Weighting Configuration

The system uses configurable token weightings to control reward distribution:

```typescript
// Example configuration in merkl-processor.service.ts
DEPLOYMENT_TOKEN_WEIGHTINGS: {
  [ExchangeId.OGEthereum]: {
    tokenWeightings: {
      '0xdAC17F958D2ee523a2206206994597C13D831ec7': 0.7, // USDT - 70% weighting
      '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE': 1.8, // ETH - 180% weighting
    },
    whitelistedAssets: [], // Standard weighting tokens
    defaultWeighting: 1, // Default for unlisted tokens
  }
}
```

**Weighting Effects:**

- `0`: No rewards for this token
- `0.5`: Half rewards compared to baseline
- `1.0`: Standard reward amount
- `2.0`: Double rewards compared to baseline

### Reward Processing Flow

1. **Campaign Detection**: System identifies active campaigns requiring processing
2. **Price Cache Creation**: Builds comprehensive USD price cache for consistent rates
3. **Epoch Calculation**: Determines which epochs need processing (unprocessed + recent updates)
4. **Temporal Isolation**: Each epoch processes with its own isolated state
5. **Sub-Epoch Generation**: Creates time-based snapshots within epochs
6. **Reward Distribution**: Calculates rewards based on liquidity proximity to market prices
7. **Budget Enforcement**: Applies proportional scaling if rewards exceed campaign limits

### Key Features

#### Temporal Isolation

- Each epoch maintains completely isolated strategy states
- Prevents future events from affecting past reward calculations
- Ensures reproducible and auditable results

#### Price-Based Eligibility

- Rewards distributed based on proximity to market price
- Closer to market price = higher reward eligibility
- Uses 2% tolerance zone around market prices

#### Budget Management

- Automatic tracking of distributed vs. total campaign amounts
- Proportional scaling when rewards would exceed budget
- Real-time budget enforcement prevents over-distribution

#### Deterministic Processing

- Transaction-based seed generation for reproducible randomness
- Chronological event processing ensures consistent results
- All calculations use high-precision Decimal arithmetic

### Monitoring and Troubleshooting

#### Key Log Messages

- `Processing merkl with epoch-based batching up to block X`: Processing started
- `Found X epoch batches to process`: Number of epochs to process
- `Processing epoch batch: campaign-X-epoch-Y`: Individual epoch processing
- `Saved X sub-epoch records for epoch Y`: Successful epoch completion

#### Common Issues

**No Active Campaigns Found**

```
No active campaigns found for blockchain-exchangeId
```

- **Solution**: Verify campaigns exist in database and are marked as active
- **Check**: Campaign start/end dates are valid for current time

**Missing Environment Variables**

```
MERKL_SNAPSHOT_SALT environment variable is required for secure seed generation
```

- **Solution**: Add required environment variable to `.env` file
- **Critical**: Never skip this in production environments

**Budget Exceeded**

```
Campaign X: Capping rewards from Y to Z
```

- **Expected**: System automatically scales rewards to fit budget
- **Action**: Monitor for frequent capping which may indicate configuration issues

### Security Considerations

⚠️ **Financial Critical System**: The Merkl rewards system handles real financial distributions:

1. **Environment Security**: Protect `MERKL_SNAPSHOT_SALT` as a secret
2. **Database Access**: Restrict campaign creation to authorized personnel only
3. **Audit Trail**: All reward calculations are logged and traceable
4. **Precision Requirements**: Never modify Decimal arithmetic operations
5. **Temporal Integrity**: Never bypass temporal isolation mechanisms

### API Endpoints

The system provides read-only API endpoints for reward data:

- `GET /:exchangeId/merkle/data` - Campaign and configuration data
- `GET /:exchangeId/merkle/rewards` - Reward distribution data

**Note**: No write endpoints are provided for security. All campaign management must be done via direct database access.

## License

Carbon Backend is licensed under the [MIT License](LICENSE).

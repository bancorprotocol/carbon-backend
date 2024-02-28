# Carbon Backend

Carbon Backend, built with [Nest.js](https://nestjs.com), serves as a specialized backend solution for aggregating insights from Carbon smart contracts and delivering them through APIs. It provides a suite of APIs offering valuable insights, such as trading activity and history.

## Prerequisites

Before setting up Carbon Backend, ensure you have the following prerequisites:

- **[TimescaleDB](https://docs.timescale.com/self-hosted/latest/install)**: Ensure TimescaleDB is properly installed and running.
- **[Redis](https://redis.io/docs/install/install-stack)**: Ensure Redis is properly installed and running.
- **[CoinGecko](https://www.coingecko.com/en/api)**: Obtain an API key from CoinGecko.
- **[CoinMarketCap](https://www.coingecko.com/en/api)**: Obtain an API key from CoinMarketCap.
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

4. Configure environment variables:

   Duplicate the `.env.example` file as `.env`:

   ```bash
   cp .env.example .env
   ```

   Provide the required values in the `.env` file.

5. (Optional) If you wish to utilize the simulator feature, install the required Python packages:

   ```bash
   pip install -r src/simulator/requirements.txt
   ```

## Usage

To run Carbon Backend:

```bash
npm start
```

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

By following these steps, you can seamlessly switch Carbon Backend's network to suit your deployment or environment.

## License

Carbon Backend is licensed under the [MIT License](LICENSE).

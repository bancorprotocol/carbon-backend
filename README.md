# Carbon Backend

Carbon Backend, built with [Nest.js](https://nestjs.com), serves as a specialized backend solution for aggregating insights from Carbon smart contracts and delivering them through APIs. It provides a suite of APIs offering valuable insights, such as trading activity and history.

## Prerequisites

Before setting up Carbon Backend, ensure you have the following prerequisites:

- **[TimescaleDB](https://docs.timescale.com/self-hosted/latest/install)**: Ensure TimescaleDB is properly installed and running.
- **[Redis](https://redis.io/docs/install/install-stack)**: Ensure Redis is properly installed and running.
- **[CoinGecko](https://www.coingecko.com/en/api)**: Obtain an API key from CoinGecko.
- **[CoinMarketCap](https://www.coingecko.com/en/api)**: Obtain an API key from CoinMarketCap.

## Installation

To set up Carbon Backend, follow these steps:

1. Clone the repository:

   ```
   git clone https://github.com/bancorprotocol/carbon-backend
   ```

2. Navigate to the project directory:

   ```
   cd carbon-backend
   ```

3. Install dependencies:

   ```
   npm install
   ```

4. Configure environment variables:

   Duplicate the `.env.example` file as `.env`:

   ```bash
   cp .env.example .env
   ```

   Provide the required values in the `.env` file.

## Usage

To run Carbon Backend:

    ```
    npm start
    ```

Access the API documentation by navigating to [http://localhost:3000](http://localhost:3000) in your browser.

## License

Carbon Backend is licensed under the [MIT License](LICENSE).

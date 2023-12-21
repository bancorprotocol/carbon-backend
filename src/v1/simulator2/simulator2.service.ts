import { Injectable } from '@nestjs/common';
import { Simulator2Dto } from './simulator2.dto';
import { CoinMarketCapService } from '../../coinmarketcap/coinmarketcap.service';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import * as childProcess from 'child_process';
import Decimal from 'decimal.js';
import moment from 'moment';
import { toTimestamp } from 'src/utilities';

@Injectable()
export class Simulator2Service {
  constructor(private readonly coinMarketCapService: CoinMarketCapService) {}

  async generateSimulation(params: Simulator2Dto): Promise<any> {
    const {
      baseToken,
      quoteToken,
      start,
      end,
      // startingPortfolioValue,
      // highRangeHighPriceCash,
      // highRangeLowPriceCash,
      // lowRangeHighPriceCash,
      // lowRangeLowPriceCash,
      // startRateHighRange,
      // startRateLowRange,
      // cashProportion,
      // riskProportion,
      // networkFee,
    } = params;

    const tokens = [baseToken, quoteToken];
    const prices = await this.coinMarketCapService.getHistoricalQuotes(tokens, start, end);

    const pricesBaseToken = prices[baseToken];
    const pricesQuoteToken = prices[quoteToken];

    // Synchronize arrays to have the same length
    const minLength = Math.min(pricesBaseToken.length, pricesQuoteToken.length);
    const trimmedPricesBaseToken = pricesBaseToken.slice(0, minLength);
    const trimmedPricesQuoteToken = pricesQuoteToken.slice(0, minLength);

    // Use the trimmed arrays for dates and pricesRatios
    const dates = trimmedPricesBaseToken.map((p) => moment.unix(p.timestamp).toISOString());
    const pricesRatios = trimmedPricesBaseToken.map((p, i) =>
      new Decimal(p.price).div(trimmedPricesQuoteToken[i].price).toString(),
    );

    // Step 1: Create input.json
    const timestamp = Date.now();
    const folderPath = path.join(__dirname, `../../simulator/simulation_${timestamp}`);
    const inputFilePath = path.join(folderPath, 'input.json');
    const outputPath = path.join(folderPath, 'output.json');
    // const logPath = path.join(folderPath, 'output.log');

    const inputData = {
      starting_portfolio_value: startingPortfolioValue,
      high_range_high_price_CASH: highRangeHighPriceCash,
      high_range_low_price_CASH: highRangeLowPriceCash,
      low_range_high_price_CASH: lowRangeHighPriceCash,
      low_range_low_price_CASH: lowRangeLowPriceCash,
      start_rate_high_range: startRateHighRange,
      start_rate_low_range: startRateLowRange,
      CASH_proportion: cashProportion,
      RISK_proportion: riskProportion,
      network_fee: networkFee,
      prices: pricesRatios,
      // logging: {
      //   output_file_name: logPath,
      //   cash_token_symbol: 'ETH',
      //   risk_token_symbol: 'BTC',
      //   dates,
      // },
    };

    // Create folder if it doesn't exist
    await fsPromises.mkdir(folderPath, { recursive: true });

    // Write input data to input.json
    await fsPromises.writeFile(inputFilePath, JSON.stringify(inputData, null, 2));

    // Step 2: Run Python executable
    const pythonExecutablePath = path.join(__dirname, '../../simulator/run.py');

    // Run Python executable asynchronously
    const pythonProcess = childProcess.spawn('python3', [pythonExecutablePath, '-c', inputFilePath, '-o', outputPath]);

    // Capture Python process output
    let pythonOutput = '';

    pythonProcess.stdout.on('data', (data) => {
      pythonOutput += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`Error from Python process: ${data.toString()}`);
    });

    try {
      // Return a promise that resolves with the content of the output.json file
      await new Promise<void>((resolve, reject) => {
        // Handle process exit
        pythonProcess.on('close', (code) => {
          if (code !== 0) {
            console.error(`Python process exited with code ${code}`);
            reject(new Error(`Python process exited with code ${code}`));
            return;
          }

          resolve();
        });
      });

      // Read the content of the output.json file
      const outputData = await fsPromises.readFile(outputPath, 'utf-8');

      const parsedOutput = JSON.parse(outputData);
      // Add the 'dates' array to the result
      parsedOutput.dates = dates.map((d) => toTimestamp(new Date(d)));

      return parsedOutput;
    } catch (err) {
      console.error('Error in generateSimulation:', err.message);
      throw err;
    }
  }
}

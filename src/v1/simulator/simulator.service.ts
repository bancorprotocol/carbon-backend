import { Injectable } from '@nestjs/common';
import { SimulatorDto } from './simulator.dto';
import { CoinMarketCapService } from '../../coinmarketcap/coinmarketcap.service';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import * as childProcess from 'child_process';
import Decimal from 'decimal.js';
import moment from 'moment';
import { toTimestamp } from 'src/utilities';

@Injectable()
export class SimulatorService {
  constructor(private readonly coinMarketCapService: CoinMarketCapService) {}

  async generateSimulation(params: SimulatorDto): Promise<any> {
    const {
      token0,
      token1,
      start,
      end,
      portfolioCashValue,
      portfolioRiskValue,
      lowRangeLowPrice,
      lowRangeHighPrice,
      lowRangeStartPrice,
      highRangeLowPrice,
      highRangeHighPrice,
      highRangeStartPrice,
      networkFee,
    } = params;

    const tokens = [token0, token1];
    const prices = await this.coinMarketCapService.getHistoricalQuotes(tokens, start, end);

    const pricesToken0 = prices[token0];
    const pricesToken1 = prices[token1];

    // Synchronize arrays to have the same length
    const minLength = Math.min(pricesToken0.length, pricesToken1.length);
    const trimmedPricesToken0 = pricesToken0.slice(0, minLength);
    const trimmedPricesToken1 = pricesToken1.slice(0, minLength);

    // Use the trimmed arrays for dates and pricesRatios
    const dates = trimmedPricesToken0.map((p) => moment.unix(p.timestamp).toISOString());
    const pricesRatios = trimmedPricesToken0.map((p, i) =>
      new Decimal(p.price).div(trimmedPricesToken1[i].price).toString(),
    );

    // Step 1: Create input.json
    const timestamp = Date.now();
    const folderPath = path.join(__dirname, `../../simulator/simulation_${timestamp}`);
    const inputFilePath = path.join(folderPath, 'input.json');
    const outputPath = path.join(folderPath, 'output.json');
    const logPath = path.join(folderPath, 'output.log');

    const inputData = {
      portfolio_cash_value: portfolioCashValue,
      portfolio_risk_value: portfolioRiskValue,
      low_range_low_price: lowRangeLowPrice,
      low_range_high_price: lowRangeHighPrice,
      low_range_start_price: lowRangeStartPrice,
      high_range_low_price: highRangeLowPrice,
      high_range_high_price: highRangeHighPrice,
      high_range_start_price: highRangeStartPrice,
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

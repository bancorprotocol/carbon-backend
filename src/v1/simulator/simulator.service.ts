import { Injectable } from '@nestjs/common';
import { SimulatorDto } from './simulator.dto';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import * as childProcess from 'child_process';
import Decimal from 'decimal.js';
import moment from 'moment';
import { toTimestamp } from '../../utilities';
import { PairTradingFeePpmUpdatedEventService } from '../../events/pair-trading-fee-ppm-updated-event/pair-trading-fee-ppm-updated-event.service';
import { TradingFeePpmUpdatedEventService } from '../../events/trading-fee-ppm-updated-event/trading-fee-ppm-updated-event.service';
import { HistoricQuoteService } from '../../historic-quote/historic-quote.service';
import { BlockchainType, Deployment } from '../../deployment/deployment.service';

@Injectable()
export class SimulatorService {
  constructor(
    private readonly tradingFeePpmUpdatedEventService: TradingFeePpmUpdatedEventService,
    private readonly pairTradingFeePpmUpdatedEventService: PairTradingFeePpmUpdatedEventService,
    private readonly historicQuoteService: HistoricQuoteService,
  ) {}

  async generateSimulation(params: SimulatorDto, usdPrices: any, deployment: Deployment): Promise<any> {
    const { start, end, buyBudget, sellBudget, buyMin, buyMax, sellMin, sellMax } = params;
    let baseToken = params['baseToken'].toLowerCase();
    let quoteToken = params['quoteToken'].toLowerCase();
    const nativeToken = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

    const wrappedSeiToken = '0xe30fedd158a2e3b13e9badaeabafc5516e95e8c7';
    if (deployment.blockchainType === BlockchainType.Sei) {
      baseToken = baseToken === nativeToken ? wrappedSeiToken : baseToken;
      quoteToken = quoteToken === nativeToken ? wrappedSeiToken : quoteToken;
    }
    const celoToken = '0x471ece3750da237f93b8e339c536989b8978a438';
    if (deployment.blockchainType === BlockchainType.Celo) {
      baseToken = baseToken === nativeToken ? celoToken : baseToken;
      quoteToken = quoteToken === nativeToken ? celoToken : quoteToken;
    }

    // handle fees
    const defaultFee = (await this.tradingFeePpmUpdatedEventService.last(deployment)).newFeePPM;
    const pairFees = await this.pairTradingFeePpmUpdatedEventService.allAsDictionary(deployment);
    let feePpm;
    if (pairFees[baseToken] && pairFees[baseToken][quoteToken]) {
      feePpm = pairFees[baseToken][quoteToken];
    } else {
      feePpm = defaultFee;
    }

    // handle prices
    const tokens = [baseToken, quoteToken];
    const prices = await this.historicQuoteService.getHistoryQuotesBuckets(
      deployment.blockchainType,
      tokens,
      start,
      end,
    );
    const pricesBaseToken = prices[baseToken];
    const pricesQuoteToken = prices[quoteToken];

    // Synchronize arrays to have the same length
    const minLength = Math.min(pricesBaseToken.length, pricesQuoteToken.length);
    const trimmedPricesBaseToken = pricesBaseToken.slice(0, minLength);
    const trimmedPricesQuoteToken = pricesQuoteToken.slice(0, minLength);

    // Use the trimmed arrays for dates and pricesRatios
    const dates = trimmedPricesBaseToken.map((p) => moment.unix(p.timestamp).toISOString());
    const pricesRatios = trimmedPricesBaseToken.map((p, i) =>
      new Decimal(p.close).div(trimmedPricesQuoteToken[i].close).toString(),
    );

    // Step 1: Create input.json
    const timestamp = Date.now();
    const folderPath = path.join(__dirname, `../../simulator/simulation_${timestamp}`);
    const inputFilePath = path.join(folderPath, 'input.json');
    const outputPath = path.join(folderPath, 'output.json');
    // const logPath = path.join(folderPath, 'output.log');

    // create inputData object
    const inputData = {
      portfolio_cash_value: buyBudget.toString(),
      portfolio_risk_value: sellBudget.toString(),
      low_range_low_price: buyMin.toString(),
      low_range_high_price: buyMax.toString(),
      low_range_start_price: buyMax.toString(),
      high_range_low_price: sellMin.toString(),
      high_range_high_price: sellMax.toString(),
      high_range_start_price: sellMin.toString(),
      network_fee: `${feePpm / 1000000}`,
      prices: pricesRatios,
      // logging: {
      //   output_file_name: logPath,
      //   cash_token_symbol: 'ETH',
      //   risk_token_symbol: 'BTC',
      //   dates,
      // },
    };

    // adjust low range start price
    if (
      new Decimal(inputData.low_range_low_price).lessThan(usdPrices[0].low) &&
      new Decimal(usdPrices[0].low).lessThan(inputData.low_range_high_price)
    ) {
      inputData.low_range_start_price = usdPrices[0].low.toString();
    }

    // adjust high range start price
    if (
      new Decimal(inputData.high_range_low_price).lessThan(usdPrices[0].high) &&
      new Decimal(usdPrices[0].high).lessThan(inputData.high_range_high_price)
    ) {
      inputData.high_range_start_price = usdPrices[0].high.toString();
    }

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

      return { ...parsedOutput, prices: pricesRatios };
    } catch (err) {
      console.error('Error in generateSimulation:', err.message);
      throw err;
    }
  }
}

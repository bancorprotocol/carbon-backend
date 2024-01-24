import { BadRequestException, Injectable } from '@nestjs/common';
import { Simulator2Dto } from './simulator2.dto';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import * as childProcess from 'child_process';
import Decimal from 'decimal.js';
import moment from 'moment';
import { toTimestamp } from 'src/utilities';
import { PairTradingFeePpmUpdatedEventService } from '../../events/pair-trading-fee-ppm-updated-event/pair-trading-fee-ppm-updated-event.service';
import { TradingFeePpmUpdatedEventService } from '../..//events/trading-fee-ppm-updated-event/trading-fee-ppm-updated-event.service';
import { HistoricQuoteService } from '../../historic-quote/historic-quote.service';

@Injectable()
export class Simulator2Service {
  constructor(
    private readonly tradingFeePpmUpdatedEventService: TradingFeePpmUpdatedEventService,
    private readonly pairTradingFeePpmUpdatedEventService: PairTradingFeePpmUpdatedEventService,
    private readonly historicQuoteService: HistoricQuoteService,
  ) {}

  async generateSimulation(params: Simulator2Dto): Promise<any> {
    const { start, end, quoteBudget, baseBudget, buyMin, buyMax, sellMin, sellMax } = params;
    const baseToken = params['baseToken'].toLowerCase();
    const quoteToken = params['quoteToken'].toLowerCase();

    // handle fees
    const defaultFee = (await this.tradingFeePpmUpdatedEventService.last()).newFeePPM;
    const pairFees = await this.pairTradingFeePpmUpdatedEventService.allAsDictionary();
    let feePpm;
    if (pairFees[baseToken] && pairFees[baseToken][quoteToken]) {
      feePpm = pairFees[baseToken][quoteToken];
    } else {
      feePpm = defaultFee;
    }

    // handle prices
    const tokens = [baseToken, quoteToken];
    const prices = await this.historicQuoteService.getHistoryQuotesBuckets(tokens, start, end);

    if (!prices[params.baseToken]) {
      throw new BadRequestException({
        message: ['The provided Base token is currently not supported in this API'],
        error: 'Bad Request',
        statusCode: 400,
      });
    }

    if (!prices[params.quoteToken]) {
      throw new BadRequestException({
        message: ['The provided Quote token is currently not supported in this API'],
        error: 'Bad Request',
        statusCode: 400,
      });
    }
    const pricesBaseToken = prices[baseToken];
    const pricesQuoteToken = prices[quoteToken];

    if (!pricesQuoteToken[0].close) {
      throw new BadRequestException({
        message: ['No data available for the quote token. Try a more recent date range'],
        error: 'Bad Request',
        statusCode: 400,
      });
    }

    if (!pricesBaseToken[0].close) {
      throw new BadRequestException({
        message: ['No data available for the base token. Try a more recent date range'],
        error: 'Bad Request',
        statusCode: 400,
      });
    }

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

    const inputData = {
      portfolio_cash_value: quoteBudget,
      portfolio_risk_value: baseBudget,
      low_range_low_price: buyMin,
      low_range_high_price: buyMax,
      low_range_start_price: buyMax,
      high_range_low_price: sellMin,
      high_range_high_price: sellMax,
      high_range_start_price: sellMin,
      network_fee: `${feePpm / 1000000}`,
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

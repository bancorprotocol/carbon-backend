import { execSync } from 'child_process';
import { existsSync } from 'fs';
import * as path from 'path';

/**
 * Deduplicate CSV file by keeping the latest occurrence of each strategy_id + sub_epoch_timestamp combination
 * Uses external Unix commands for memory-efficient processing of large files
 *
 * @param inputFile Path to input CSV file
 * @param outputFile Path to output deduplicated CSV file
 * @returns Promise that resolves when deduplication is complete
 */
export async function deduplicateCSV(inputFile: string, outputFile?: string): Promise<string> {
  // Default output file name if not provided
  if (!outputFile) {
    const ext = path.extname(inputFile);
    const base = path.basename(inputFile, ext);
    const dir = path.dirname(inputFile);
    outputFile = path.join(dir, `${base}_deduplicated${ext}`);
  }

  // Check if input file exists
  if (!existsSync(inputFile)) {
    throw new Error(`Input file not found: ${inputFile}`);
  }

  // Path to the shell script
  const scriptPath = path.join(__dirname, 'deduplicate-csv.sh');

  if (!existsSync(scriptPath)) {
    throw new Error(`Deduplication script not found: ${scriptPath}`);
  }

  try {
    console.log(`🔄 Starting CSV deduplication...`);
    console.log(`   Input: ${inputFile}`);
    console.log(`   Output: ${outputFile}`);

    // Execute the shell script
    const result = execSync(`"${scriptPath}" "${inputFile}" "${outputFile}"`, {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer for output
    });

    console.log(result);
    return outputFile;
  } catch (error) {
    throw new Error(`CSV deduplication failed: ${error.message}`);
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 1 || args.length > 2) {
    console.log('Usage: npx ts-node scripts/deduplicate-csv.ts input.csv [output.csv]');
    console.log('Example: npx ts-node scripts/deduplicate-csv.ts reward_breakdown.csv');
    process.exit(1);
  }

  const [inputFile, outputFile] = args;

  deduplicateCSV(inputFile, outputFile)
    .then((output) => {
      console.log(`✅ Deduplication completed successfully!`);
      console.log(`   Clean file: ${output}`);
    })
    .catch((error) => {
      console.error(`❌ Error: ${error.message}`);
      process.exit(1);
    });
}

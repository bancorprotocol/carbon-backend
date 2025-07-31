/**
 * A simple, seeded pseudo-random number generator (PRNG) using an LCG algorithm.
 * This version uses BigInt to prevent precision loss with large numbers, ensuring
 * that the sequence of random numbers is the same in JS and Python.
 */
class SeededRandom {
  private m = 2147483648n; // 2^31
  private a = 1103515245n;
  private c = 12345n;
  private seed: bigint;

  constructor(seed: string | number | bigint) {
    // Perform initial seeding using BigInt arithmetic
    const seedBigInt = BigInt(seed);
    // Ensure the initial seed is positive and within the bound
    this.seed = ((seedBigInt % this.m) + this.m) % this.m;
  }

  /**
   * Generates the next integer in the sequence using BigInt math.
   * @returns {bigint} The next pseudo-random bigint.
   */
  private nextInt(): bigint {
    this.seed = (this.a * this.seed + this.c) % this.m;
    return this.seed;
  }

  /**
   * Generates a random float between 0 (inclusive) and 1 (exclusive).
   * Converts the BigInt result back to a standard Number for this step.
   * @returns {number} The next pseudo-random float.
   */
  private nextFloat(): number {
    return Number(this.nextInt()) / Number(this.m);
  }

  /**
   * Generates a random integer within a given range [min, max].
   * @param {number} min The minimum value (inclusive).
   * @param {number} max The maximum value (inclusive).
   * @returns {number} A pseudo-random integer in the specified range.
   */
  public randint(min: number, max: number): number {
    return Math.floor(this.nextFloat() * (max - min + 1)) + min;
  }

  /**
   * Selects a random element from an array.
   * @template T The type of the elements in the array.
   * @param {T[]} arr The array to choose from.
   * @returns {T} A randomly selected element from the array.
   */
  public choice<T>(arr: T[]): T {
    return arr[this.randint(0, arr.length - 1)];
  }
}

/**
 * Core algorithm to generate one valid, randomized partition of an integer.
 *
 * @param {number} m The integer sum to be partitioned.
 * @param {number} aBound The minimum value for a sub-epoch (inclusive).
 * @param {number} bBound The maximum value for a sub-epoch (inclusive).
 * @param {string | number | bigint} seed The seed for the random number generator.
 * @param {number} [maxAttempts=1000] The number of times to retry before failing.
 * @returns {number[]} A list of integers that sum to m.
 * @throws {Error} If a valid partition cannot be found or if inputs are invalid.
 */
export function partitionSingleEpoch(
  m: number,
  aBound: number,
  bBound: number,
  seed: string | number | bigint,
  maxAttempts = 1000,
): number[] {
  if (aBound >= bBound) {
    throw new Error('Invalid bounds: aBound must be less than bBound.');
  }

  const nMin: number = Math.ceil(m / bBound);
  const nMax: number = Math.floor(m / aBound);

  if (nMin > nMax) {
    throw new Error('Infeasible nMin/nMax range.');
  }

  const prng = new SeededRandom(seed);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const n: number = prng.randint(nMin, nMax);
      const parts: number[] = [];
      let remainingSum: number = m;
      let remainingPieces: number = n;

      for (let i = 0; i < n - 1; i++) {
        const lowBound: number = Math.max(aBound, remainingSum - (remainingPieces - 1) * bBound);
        const highBound: number = Math.min(bBound, remainingSum - (remainingPieces - 1) * aBound);

        if (lowBound > highBound) {
          throw new Error('Invalid bounds, cannot pick a piece.');
        }

        const choices: number[] = [];
        for (let j = lowBound; j <= highBound; j++) {
          choices.push(j);
        }

        const lastPart: number | null = parts.length > 0 ? parts[parts.length - 1] : null;
        if (lastPart !== null && choices.includes(lastPart)) {
          if (choices.length > 1) {
            choices.splice(choices.indexOf(lastPart), 1);
          } else {
            throw new Error('Only choice available is a repeat.');
          }
        }

        if (choices.length === 0) {
          throw new Error('No valid choices available.');
        }

        const piece: number = prng.choice(choices);
        parts.push(piece);
        remainingSum -= piece;
        remainingPieces -= 1;
      }

      const finalPiece: number = remainingSum;
      if (finalPiece < aBound || finalPiece > bBound) {
        throw new Error('Final piece is out of bounds.');
      }

      const lastPart: number | null = parts.length > 0 ? parts[parts.length - 1] : null;
      if (lastPart !== null && finalPiece === lastPart) {
        throw new Error('Final piece repeats the previous one.');
      }

      parts.push(finalPiece);
      return parts;
    } catch (e) {
      continue;
    }
  }

  throw new Error(`Failed to find a valid partition within ${maxAttempts} attempts.`);
}

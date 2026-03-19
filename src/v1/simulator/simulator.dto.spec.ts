import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SimulatorDto } from './simulator.dto';

describe('SimulatorDto', () => {
  const validRawInput = {
    baseToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    quoteToken: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
    start: '1770940800',
    end: '1773878400',
    buyBudget: '10',
    sellBudget: '0',
    buyMin: '0.07323396082003955',
    buyMax: '0.08175459698478268731268731268731268731268731268731268731268731268731268731268731268731268731268731269',
    sellMin: '0.07330719478085958955',
    sellMax: '0.08183635158176747',
    buyMarginal: '0.08175459698478268731268731268731268731268731268731268731268731268731268731268731268731268731268731269',
    sellMarginal: '0.08183635158176747',
  };

  function transformDto(overrides: Partial<typeof validRawInput> = {}): SimulatorDto {
    return plainToInstance(SimulatorDto, { ...validRawInput, ...overrides });
  }

  describe('precision preservation', () => {
    it('should preserve full precision of buyMax as a string', () => {
      const dto = transformDto();
      expect(dto.buyMax).toBe(validRawInput.buyMax);
    });

    it('should preserve full precision of buyMin as a string', () => {
      const dto = transformDto();
      expect(dto.buyMin).toBe(validRawInput.buyMin);
    });

    it('should preserve full precision of sellMin as a string', () => {
      const dto = transformDto();
      expect(dto.sellMin).toBe(validRawInput.sellMin);
    });

    it('should preserve full precision of sellMax as a string', () => {
      const dto = transformDto();
      expect(dto.sellMax).toBe(validRawInput.sellMax);
    });

    it('should preserve full precision of buyBudget as a string', () => {
      const dto = transformDto();
      expect(dto.buyBudget).toBe(validRawInput.buyBudget);
    });

    it('should preserve full precision of sellBudget as a string', () => {
      const dto = transformDto();
      expect(dto.sellBudget).toBe(validRawInput.sellBudget);
    });

    it('should keep buyMarginal as a string with full precision', () => {
      const dto = transformDto();
      expect(dto.buyMarginal).toBe(validRawInput.buyMarginal);
    });

    it('should keep sellMarginal as a string with full precision', () => {
      const dto = transformDto();
      expect(dto.sellMarginal).toBe(validRawInput.sellMarginal);
    });

    it('buyMarginal and buyMax should be identical when given the same high-precision value', () => {
      const highPrecision = '0.08175459698478268731268731268731268731268731268731268731268731268731268731268731268731268731268731269';
      const dto = transformDto({ buyMax: highPrecision, buyMarginal: highPrecision });
      expect(dto.buyMax).toBe(dto.buyMarginal);
    });
  });

  describe('validation', () => {
    it('should pass validation with valid numeric string inputs', async () => {
      const dto = transformDto();
      const errors = await validate(dto);
      expect(errors.filter((e) => !['baseToken', 'quoteToken'].includes(e.property))).toHaveLength(0);
    });

    it('should fail validation when buyMax is not a numeric string', async () => {
      const dto = transformDto({ buyMax: 'not-a-number' });
      const errors = await validate(dto);
      const buyMaxError = errors.find((e) => e.property === 'buyMax');
      expect(buyMaxError).toBeDefined();
    });

    it('should fail validation when buyMin is not a numeric string', async () => {
      const dto = transformDto({ buyMin: 'abc' });
      const errors = await validate(dto);
      const buyMinError = errors.find((e) => e.property === 'buyMin');
      expect(buyMinError).toBeDefined();
    });

    it('should fail validation when sellBudget is not a numeric string', async () => {
      const dto = transformDto({ sellBudget: 'xyz' });
      const errors = await validate(dto);
      const sellBudgetError = errors.find((e) => e.property === 'sellBudget');
      expect(sellBudgetError).toBeDefined();
    });

    it('should accept zero as a valid numeric string', async () => {
      const dto = transformDto({ buyBudget: '0', sellBudget: '0' });
      const errors = await validate(dto);
      const budgetErrors = errors.filter((e) => ['buyBudget', 'sellBudget'].includes(e.property));
      expect(budgetErrors).toHaveLength(0);
    });
  });

  describe('regression: high-precision start_price vs high_price', () => {
    it('should not truncate buyMax so it stays equal to buyMarginal when they are the same value', () => {
      const preciseValue =
        '0.08175459698478268731268731268731268731268731268731268731268731268731268731268731268731268731268731269';
      const dto = transformDto({ buyMax: preciseValue, buyMarginal: preciseValue });

      const startPrice = dto.buyMarginal || dto.buyMax;
      const highPrice = dto.buyMax;

      expect(startPrice).toBe(highPrice);
    });

    it('should not truncate sellMin so it stays equal to sellMarginal when they are the same value', () => {
      const preciseValue = '0.07330719478085958955123456789012345678901234567890';
      const dto = transformDto({ sellMin: preciseValue, sellMarginal: preciseValue });

      const startPrice = dto.sellMarginal || dto.sellMin;
      const lowPrice = dto.sellMin;

      expect(startPrice).toBe(lowPrice);
    });

    it('toString() on string fields should be identity (no precision loss)', () => {
      const preciseValue =
        '0.08175459698478268731268731268731268731268731268731268731268731268731268731268731268731268731268731269';
      const dto = transformDto({ buyMax: preciseValue });

      expect(dto.buyMax.toString()).toBe(preciseValue);
    });
  });
});

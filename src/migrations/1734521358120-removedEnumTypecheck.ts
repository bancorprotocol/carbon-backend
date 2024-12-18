import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemovedEnumTypecheck1734521358120 implements MigrationInterface {
  name = 'RemovedEnumTypecheck1734521358120';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // TVL table
    await queryRunner.query(`DROP INDEX "public"."IDX_488c5516e8c72b2686e744bfed"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e8b3d16260b7dea43e343e3366"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_5be44c8aa379657fcef7af663c"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2d3ef18dd126f6064fbc6dfa57"`);
    await queryRunner.query(`ALTER TABLE "tvl" DROP CONSTRAINT "UQ_837985c1c667096fcb6aba2a437"`);
    await queryRunner.query(
      `ALTER TABLE "tvl" ALTER COLUMN "blockchainType" TYPE character varying USING "blockchainType"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "tvl" ALTER COLUMN "exchangeId" TYPE character varying USING "exchangeId"::text`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."tvl_blockchaintype_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."tvl_exchangeid_enum"`);

    // Total TVL table
    await queryRunner.query(`DROP INDEX "public"."IDX_77a80f3a926a86c52efa22402a"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_03e591b57b14a9618bcb029583"`);
    await queryRunner.query(`ALTER TABLE "total-tvl" DROP CONSTRAINT "UQ_7fe5b00781f6564ec055b4f88ab"`);
    await queryRunner.query(
      `ALTER TABLE "total-tvl" ALTER COLUMN "blockchainType" TYPE character varying USING "blockchainType"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "total-tvl" ALTER COLUMN "exchangeId" TYPE character varying USING "exchangeId"::text`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."total-tvl_blockchaintype_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."total-tvl_exchangeid_enum"`);

    // Tokens table
    await queryRunner.query(`DROP INDEX "public"."IDX_1fc8c9748b497072859bb0cceb"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_66ddea115f5596805dea0cd676"`);
    await queryRunner.query(
      `ALTER TABLE "tokens" ALTER COLUMN "blockchainType" TYPE character varying USING "blockchainType"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "tokens" ALTER COLUMN "exchangeId" TYPE character varying USING "exchangeId"::text`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."tokens_blockchaintype_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."tokens_exchangeid_enum"`);

    // Blocks table
    await queryRunner.query(`DROP INDEX "public"."IDX_6d88b5ea8a96fc81e3b0d52f42"`);
    await queryRunner.query(
      `ALTER TABLE "blocks" ALTER COLUMN "blockchainType" TYPE character varying USING "blockchainType"::text`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."blocks_blockchaintype_enum"`);

    // Tokens traded events table
    await queryRunner.query(`DROP INDEX "public"."IDX_89f2258231d48af5d0d43e3ecd"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2342ae203567a867b6fe366929"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_1117c3f900aaa2af9d97c39513"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e84271b4e93070bc7a68cabc9e"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c2d17f5848e8253a52408ff189"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_25ff1bba41c8559e7094ab3faa"`);
    await queryRunner.query(
      `ALTER TABLE "tokens-traded-events" ALTER COLUMN "blockchainType" TYPE character varying USING "blockchainType"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "tokens-traded-events" ALTER COLUMN "exchangeId" TYPE character varying USING "exchangeId"::text`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."tokens-traded-events_blockchaintype_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."tokens-traded-events_exchangeid_enum"`);

    // Pairs table
    await queryRunner.query(`DROP INDEX "public"."IDX_2adf8fe1e85377fa39cba7757b"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_1d894c6215a2a86d1b5bf661be"`);
    await queryRunner.query(
      `ALTER TABLE "pairs" ALTER COLUMN "blockchainType" TYPE character varying USING "blockchainType"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "pairs" ALTER COLUMN "exchangeId" TYPE character varying USING "exchangeId"::text`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."pairs_blockchaintype_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."pairs_exchangeid_enum"`);

    // Strategies table
    await queryRunner.query(`DROP INDEX "public"."IDX_2776b53d13ebed1a86d430276f"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_fa07d821f14ecc71eeae746d69"`);
    await queryRunner.query(`ALTER TABLE "strategies" DROP CONSTRAINT "UQ_ca3ef6c54f8acf3f8acd7e14e32"`);
    await queryRunner.query(
      `ALTER TABLE "strategies" ALTER COLUMN "blockchainType" TYPE character varying USING "blockchainType"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "strategies" ALTER COLUMN "exchangeId" TYPE character varying USING "exchangeId"::text`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."strategies_blockchaintype_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."strategies_exchangeid_enum"`);

    // Quotes table
    await queryRunner.query(`DROP INDEX "public"."IDX_f016f6740e3e54b90a08b478ff"`);
    await queryRunner.query(
      `ALTER TABLE "quotes" ALTER COLUMN "blockchainType" TYPE character varying USING "blockchainType"::text`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."quotes_blockchaintype_enum"`);

    // Historic quotes table
    await queryRunner.query(`DROP INDEX "public"."IDX_token_address_desc"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_9e13b1c45c5d2beb1b69711236"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_51502c505f256a69be325a6345"`);
    await queryRunner.query(`ALTER TABLE "historic-quotes" ALTER COLUMN "blockchainType" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "historic-quotes" ALTER COLUMN "blockchainType" TYPE character varying USING "blockchainType"::text`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."historic-quotes_blockchaintype_enum"`);

    // Activities table
    await queryRunner.query(`DROP INDEX "public"."IDX_aff636fa5ca427c38c0d9e7dd4"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_92287e565a13c640a4a6d0bd2f"`);
    await queryRunner.query(`ALTER TABLE "activities" DROP CONSTRAINT "UQ_1a24b75ad87c83b0761f6e00135"`);
    await queryRunner.query(
      `ALTER TABLE "activities" ALTER COLUMN "blockchainType" TYPE character varying USING "blockchainType"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "activities" ALTER COLUMN "exchangeId" TYPE character varying USING "exchangeId"::text`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."activities_blockchaintype_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."activities_exchangeid_enum"`);

    // Voucher transfer events table
    await queryRunner.query(`DROP INDEX "public"."IDX_2e20328d5565ff6b3131ae93b5"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_3e7da58e7cdefd620d5d780fe8"`);
    await queryRunner.query(
      `ALTER TABLE "voucher-transfer-events" ALTER COLUMN "blockchainType" TYPE character varying USING "blockchainType"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "voucher-transfer-events" ALTER COLUMN "exchangeId" TYPE character varying USING "exchangeId"::text`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."voucher-transfer-events_blockchaintype_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."voucher-transfer-events_exchangeid_enum"`);

    // Vortex trading reset events table
    await queryRunner.query(`DROP INDEX "public"."IDX_a3a015d6530eec204734606276"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8c31037872ad8a8a8280d51261"`);
    await queryRunner.query(
      `ALTER TABLE "vortex-trading-reset-events" ALTER COLUMN "blockchainType" TYPE character varying USING "blockchainType"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "vortex-trading-reset-events" ALTER COLUMN "exchangeId" TYPE character varying USING "exchangeId"::text`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."vortex-trading-reset-events_blockchaintype_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."vortex-trading-reset-events_exchangeid_enum"`);

    // Vortex tokens traded events table
    await queryRunner.query(`DROP INDEX "public"."IDX_fd9d2d0903bc14e8435c634b0f"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e4f82c59c17e9787d6bd1364d6"`);
    await queryRunner.query(
      `ALTER TABLE "vortex-tokens-traded-events" ALTER COLUMN "blockchainType" TYPE character varying USING "blockchainType"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "vortex-tokens-traded-events" ALTER COLUMN "exchangeId" TYPE character varying USING "exchangeId"::text`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."vortex-tokens-traded-events_blockchaintype_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."vortex-tokens-traded-events_exchangeid_enum"`);

    // Vortex funds withdrawn events table
    await queryRunner.query(`DROP INDEX "public"."IDX_377408d0c0541389473b3835b6"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_3db3cd5cb695111b75f7b30b6e"`);
    await queryRunner.query(
      `ALTER TABLE "vortex-funds-withdrawn-events" ALTER COLUMN "blockchainType" TYPE character varying USING "blockchainType"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "vortex-funds-withdrawn-events" ALTER COLUMN "exchangeId" TYPE character varying USING "exchangeId"::text`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."vortex-funds-withdrawn-events_blockchaintype_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."vortex-funds-withdrawn-events_exchangeid_enum"`);

    // Strategy updated events table
    await queryRunner.query(`DROP INDEX "public"."IDX_0c842871c198090f0467451e9d"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_bc3628a6daaf2e7e169292f4ce"`);
    await queryRunner.query(
      `ALTER TABLE "strategy-updated-events" ALTER COLUMN "blockchainType" TYPE character varying USING "blockchainType"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "strategy-updated-events" ALTER COLUMN "exchangeId" TYPE character varying USING "exchangeId"::text`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."strategy-updated-events_blockchaintype_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."strategy-updated-events_exchangeid_enum"`);

    // Strategy created events table
    await queryRunner.query(`DROP INDEX "public"."IDX_7671de629ff77fbfb76d048416"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_32ec6fba5ace9de71aa011bf0a"`);
    await queryRunner.query(
      `ALTER TABLE "strategy-created-events" ALTER COLUMN "blockchainType" TYPE character varying USING "blockchainType"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "strategy-created-events" ALTER COLUMN "exchangeId" TYPE character varying USING "exchangeId"::text`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."strategy-created-events_blockchaintype_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."strategy-created-events_exchangeid_enum"`);

    // Arbitrage executed events table
    await queryRunner.query(`DROP INDEX "public"."IDX_c498a9178b0c1aa00f91b554b4"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_54cadf5810efa5baacf5514bd3"`);
    await queryRunner.query(
      `ALTER TABLE "arbitrage-executed-events" ALTER COLUMN "blockchainType" TYPE character varying USING "blockchainType"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "arbitrage-executed-events" ALTER COLUMN "exchangeId" TYPE character varying USING "exchangeId"::text`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."arbitrage-executed-events_blockchaintype_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."arbitrage-executed-events_exchangeid_enum"`);

    // Pair trading fee ppm updated events table
    await queryRunner.query(`DROP INDEX "public"."IDX_0a2ca9f9e49c70f49970fb9dcf"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_13877d16eb7f4665c50993f657"`);
    await queryRunner.query(
      `ALTER TABLE "pair-trading-fee-ppm-updated-events" ALTER COLUMN "blockchainType" TYPE character varying USING "blockchainType"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "pair-trading-fee-ppm-updated-events" ALTER COLUMN "exchangeId" TYPE character varying USING "exchangeId"::text`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."pair-trading-fee-ppm-updated-events_blockchaintype_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."pair-trading-fee-ppm-updated-events_exchangeid_enum"`);

    // Strategy deleted events table
    await queryRunner.query(`DROP INDEX "public"."IDX_8b93141dbde79a439f8c1bfd46"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2019b1709d451d3739d3e93aa9"`);
    await queryRunner.query(
      `ALTER TABLE "strategy-deleted-events" ALTER COLUMN "blockchainType" TYPE character varying USING "blockchainType"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "strategy-deleted-events" ALTER COLUMN "exchangeId" TYPE character varying USING "exchangeId"::text`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."strategy-deleted-events_blockchaintype_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."strategy-deleted-events_exchangeid_enum"`);

    // Pair created events table
    await queryRunner.query(`DROP INDEX "public"."IDX_8b60bbe8a3935e59d07f9e2084"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a6f2f1d9ba6aa8dec091ccd1d3"`);
    await queryRunner.query(
      `ALTER TABLE "pair-created-events" ALTER COLUMN "blockchainType" TYPE character varying USING "blockchainType"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "pair-created-events" ALTER COLUMN "exchangeId" TYPE character varying USING "exchangeId"::text`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."pair-created-events_blockchaintype_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."pair-created-events_exchangeid_enum"`);

    // Trading fee ppm updated events table
    await queryRunner.query(`DROP INDEX "public"."IDX_af9af71f6ad35cf07505151c41"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ec78d4bb8fa7e46d00ec1d26e2"`);
    await queryRunner.query(
      `ALTER TABLE "trading-fee-ppm-updated-events" ALTER COLUMN "blockchainType" TYPE character varying USING "blockchainType"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "trading-fee-ppm-updated-events" ALTER COLUMN "exchangeId" TYPE character varying USING "exchangeId"::text`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."trading-fee-ppm-updated-events_blockchaintype_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."trading-fee-ppm-updated-events_exchangeid_enum"`);

    // Recreate all indexes
    await queryRunner.query(`CREATE INDEX "IDX_5be44c8aa379657fcef7af663c" ON "tvl" ("blockchainType") `);
    await queryRunner.query(`CREATE INDEX "IDX_2d3ef18dd126f6064fbc6dfa57" ON "tvl" ("exchangeId") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_488c5516e8c72b2686e744bfed" ON "tvl" ("address", "blockchainType", "exchangeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e8b3d16260b7dea43e343e3366" ON "tvl" ("pairId", "blockchainType", "exchangeId") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_77a80f3a926a86c52efa22402a" ON "total-tvl" ("blockchainType") `);
    await queryRunner.query(`CREATE INDEX "IDX_03e591b57b14a9618bcb029583" ON "total-tvl" ("exchangeId") `);
    await queryRunner.query(`CREATE INDEX "IDX_1fc8c9748b497072859bb0cceb" ON "tokens" ("blockchainType") `);
    await queryRunner.query(`CREATE INDEX "IDX_66ddea115f5596805dea0cd676" ON "tokens" ("exchangeId") `);
    await queryRunner.query(`CREATE INDEX "IDX_6d88b5ea8a96fc81e3b0d52f42" ON "blocks" ("blockchainType") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_c2d17f5848e8253a52408ff189" ON "tokens-traded-events" ("blockchainType") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_25ff1bba41c8559e7094ab3faa" ON "tokens-traded-events" ("exchangeId") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_89f2258231d48af5d0d43e3ecd" ON "tokens-traded-events" ("trader", "blockchainType", "exchangeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2342ae203567a867b6fe366929" ON "tokens-traded-events" ("targetTokenId", "blockchainType", "exchangeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1117c3f900aaa2af9d97c39513" ON "tokens-traded-events" ("sourceTokenId", "blockchainType", "exchangeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e84271b4e93070bc7a68cabc9e" ON "tokens-traded-events" ("pairId", "blockchainType", "exchangeId") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_2adf8fe1e85377fa39cba7757b" ON "pairs" ("blockchainType") `);
    await queryRunner.query(`CREATE INDEX "IDX_1d894c6215a2a86d1b5bf661be" ON "pairs" ("exchangeId") `);
    await queryRunner.query(`CREATE INDEX "IDX_2776b53d13ebed1a86d430276f" ON "strategies" ("blockchainType") `);
    await queryRunner.query(`CREATE INDEX "IDX_fa07d821f14ecc71eeae746d69" ON "strategies" ("exchangeId") `);
    await queryRunner.query(`CREATE INDEX "IDX_f016f6740e3e54b90a08b478ff" ON "quotes" ("blockchainType") `);
    await queryRunner.query(`CREATE INDEX "IDX_51502c505f256a69be325a6345" ON "historic-quotes" ("blockchainType") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_9e13b1c45c5d2beb1b69711236" ON "historic-quotes" ("blockchainType", "tokenAddress", "timestamp") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_aff636fa5ca427c38c0d9e7dd4" ON "activities" ("blockchainType") `);
    await queryRunner.query(`CREATE INDEX "IDX_92287e565a13c640a4a6d0bd2f" ON "activities" ("exchangeId") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_2e20328d5565ff6b3131ae93b5" ON "voucher-transfer-events" ("blockchainType") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3e7da58e7cdefd620d5d780fe8" ON "voucher-transfer-events" ("exchangeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a3a015d6530eec204734606276" ON "vortex-trading-reset-events" ("blockchainType") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8c31037872ad8a8a8280d51261" ON "vortex-trading-reset-events" ("exchangeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fd9d2d0903bc14e8435c634b0f" ON "vortex-tokens-traded-events" ("blockchainType") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e4f82c59c17e9787d6bd1364d6" ON "vortex-tokens-traded-events" ("exchangeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_377408d0c0541389473b3835b6" ON "vortex-funds-withdrawn-events" ("blockchainType") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3db3cd5cb695111b75f7b30b6e" ON "vortex-funds-withdrawn-events" ("exchangeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0c842871c198090f0467451e9d" ON "strategy-updated-events" ("blockchainType") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bc3628a6daaf2e7e169292f4ce" ON "strategy-updated-events" ("exchangeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7671de629ff77fbfb76d048416" ON "strategy-created-events" ("blockchainType") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_32ec6fba5ace9de71aa011bf0a" ON "strategy-created-events" ("exchangeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c498a9178b0c1aa00f91b554b4" ON "arbitrage-executed-events" ("blockchainType") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_54cadf5810efa5baacf5514bd3" ON "arbitrage-executed-events" ("exchangeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0a2ca9f9e49c70f49970fb9dcf" ON "pair-trading-fee-ppm-updated-events" ("blockchainType") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_13877d16eb7f4665c50993f657" ON "pair-trading-fee-ppm-updated-events" ("exchangeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8b93141dbde79a439f8c1bfd46" ON "strategy-deleted-events" ("blockchainType") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2019b1709d451d3739d3e93aa9" ON "strategy-deleted-events" ("exchangeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8b60bbe8a3935e59d07f9e2084" ON "pair-created-events" ("blockchainType") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_a6f2f1d9ba6aa8dec091ccd1d3" ON "pair-created-events" ("exchangeId") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_af9af71f6ad35cf07505151c41" ON "trading-fee-ppm-updated-events" ("blockchainType") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ec78d4bb8fa7e46d00ec1d26e2" ON "trading-fee-ppm-updated-events" ("exchangeId") `,
    );

    // Recreate unique constraints
    await queryRunner.query(
      `ALTER TABLE "tvl" ADD CONSTRAINT "UQ_837985c1c667096fcb6aba2a437" UNIQUE ("blockchainType", "exchangeId", "strategyId", "pairName", "symbol", "tvl", "address", "evt_block_time", "evt_block_number", "reason", "transaction_index")`,
    );
    await queryRunner.query(
      `ALTER TABLE "total-tvl" ADD CONSTRAINT "UQ_7fe5b00781f6564ec055b4f88ab" UNIQUE ("blockchainType", "exchangeId", "timestamp")`,
    );
    await queryRunner.query(
      `ALTER TABLE "strategies" ADD CONSTRAINT "UQ_ca3ef6c54f8acf3f8acd7e14e32" UNIQUE ("blockchainType", "exchangeId", "strategyId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "activities" ADD CONSTRAINT "UQ_1a24b75ad87c83b0761f6e00135" UNIQUE ("blockchainType", "exchangeId", "strategyId", "action", "baseQuote", "baseSellToken", "baseSellTokenAddress", "quoteBuyToken", "quoteBuyTokenAddress", "buyBudget", "sellBudget", "buyPriceA", "buyPriceMarg", "buyPriceB", "sellPriceA", "sellPriceMarg", "sellPriceB", "timestamp", "txhash", "blockNumber")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Note: The down migration would need to recreate the enum types and convert the data back
    // This is a complex operation that should be carefully implemented if needed
    throw new Error('Down migration not implemented');
  }
}

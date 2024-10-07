import { MigrationInterface, QueryRunner } from 'typeorm';

export class Seed1725540816542 implements MigrationInterface {
  name = 'Seed1725540816542';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."activities_blockchaintype_enum" AS ENUM('ethereum', 'sei-network', 'celo', 'blast')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."activities_exchangeid_enum" AS ENUM('ethereum', 'sei', 'celo', 'blast')`,
    );
    await queryRunner.query(
      `CREATE TABLE "activities" ("id" SERIAL NOT NULL, "blockchainType" "public"."activities_blockchaintype_enum" NOT NULL, "exchangeId" "public"."activities_exchangeid_enum" NOT NULL, "strategyId" character varying NOT NULL, "creationWallet" character varying, "currentOwner" character varying, "oldOwner" character varying, "newOwner" character varying, "action" character varying NOT NULL, "baseQuote" character varying NOT NULL, "baseSellToken" character varying NOT NULL, "baseSellTokenAddress" character varying NOT NULL, "quoteBuyToken" character varying NOT NULL, "quoteBuyTokenAddress" character varying NOT NULL, "buyBudget" character varying NOT NULL, "sellBudget" character varying NOT NULL, "buyBudgetChange" character varying, "sellBudgetChange" character varying, "buyPriceA" character varying NOT NULL, "buyPriceMarg" character varying NOT NULL, "buyPriceB" character varying NOT NULL, "sellPriceA" character varying NOT NULL, "sellPriceMarg" character varying NOT NULL, "sellPriceB" character varying NOT NULL, "buyPriceADelta" character varying, "buyPriceMargDelta" character varying, "buyPriceBDelta" character varying, "sellPriceADelta" character varying, "sellPriceMargDelta" character varying, "sellPriceBDelta" character varying, "strategySold" character varying, "tokenSold" character varying, "strategyBought" character varying, "tokenBought" character varying, "avgPrice" character varying, "timestamp" TIMESTAMP NOT NULL, "txhash" character varying NOT NULL, "blockNumber" integer NOT NULL, CONSTRAINT "UQ_1a24b75ad87c83b0761f6e00135" UNIQUE ("blockchainType", "exchangeId", "strategyId", "action", "baseQuote", "baseSellToken", "baseSellTokenAddress", "quoteBuyToken", "quoteBuyTokenAddress", "buyBudget", "sellBudget", "buyPriceA", "buyPriceMarg", "buyPriceB", "sellPriceA", "sellPriceMarg", "sellPriceB", "timestamp", "txhash", "blockNumber"), CONSTRAINT "PK_7f4004429f731ffb9c88eb486a8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_aff636fa5ca427c38c0d9e7dd4" ON "activities" ("blockchainType") `);
    await queryRunner.query(`CREATE INDEX "IDX_92287e565a13c640a4a6d0bd2f" ON "activities" ("exchangeId") `);
    await queryRunner.query(`CREATE INDEX "IDX_ed7d7cafd4008a96ea01f84e8d" ON "activities" ("strategyId") `);
    await queryRunner.query(`CREATE INDEX "IDX_330e316f8c4fcf8c1c67fb5c27" ON "activities" ("currentOwner") `);
    await queryRunner.query(`CREATE INDEX "IDX_f9933081beb56daabab983bb9b" ON "activities" ("oldOwner") `);
    await queryRunner.query(`CREATE INDEX "IDX_19f959f0c1d781ee56011fc54a" ON "activities" ("action") `);
    await queryRunner.query(`CREATE INDEX "IDX_fd16c05b698b362ae70e600002" ON "activities" ("baseSellTokenAddress") `);
    await queryRunner.query(`CREATE INDEX "IDX_9c9b6d29467f616fc2c36de948" ON "activities" ("quoteBuyTokenAddress") `);
    await queryRunner.query(`CREATE INDEX "IDX_9001cd379d53da60d57f5231d0" ON "activities" ("timestamp") `);
    await queryRunner.query(`CREATE INDEX "IDX_9898af294babb482eaa412cc09" ON "activities" ("blockNumber") `);
    await queryRunner.query(
      `CREATE TYPE "public"."blocks_blockchaintype_enum" AS ENUM('ethereum', 'sei-network', 'celo', 'blast')`,
    );
    await queryRunner.query(
      `CREATE TABLE "blocks" ("id" integer NOT NULL, "blockchainType" "public"."blocks_blockchaintype_enum" NOT NULL, "timestamp" TIMESTAMP NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_8244fa1495c4e9222a01059244b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_6d88b5ea8a96fc81e3b0d52f42" ON "blocks" ("blockchainType") `);
    await queryRunner.query(
      `CREATE TYPE "public"."historic-quotes_blockchaintype_enum" AS ENUM('ethereum', 'sei-network', 'celo', 'blast')`,
    );
    await queryRunner.query(
      `CREATE TABLE "historic-quotes" ("id" SERIAL NOT NULL, "blockchainType" "public"."historic-quotes_blockchaintype_enum" NOT NULL DEFAULT 'ethereum', "timestamp" TIMESTAMP NOT NULL, "tokenAddress" character varying NOT NULL, "provider" character varying NOT NULL, "usd" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT ('now'::text)::timestamp(6) with time zone, "updatedAt" TIMESTAMP NOT NULL DEFAULT ('now'::text)::timestamp(6) with time zone, CONSTRAINT "PK_e342adbd6f8f907b412ff681929" PRIMARY KEY ("id", "timestamp"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_51502c505f256a69be325a6345" ON "historic-quotes" ("blockchainType") `);
    await queryRunner.query(`CREATE INDEX "IDX_ab617affe46aa00bdd295edce0" ON "historic-quotes" ("timestamp") `);
    await queryRunner.query(`CREATE INDEX "IDX_5ab5c8ab52bc42e68dcbc96558" ON "historic-quotes" ("tokenAddress") `);
    await queryRunner.query(
      `CREATE TABLE "last_processed_block" ("id" SERIAL NOT NULL, "param" character varying NOT NULL, "block" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3914bf93d966710965afd83ce55" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tokens_blockchaintype_enum" AS ENUM('ethereum', 'sei-network', 'celo', 'blast')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tokens_exchangeid_enum" AS ENUM('ethereum', 'sei', 'celo', 'blast')`,
    );
    await queryRunner.query(
      `CREATE TABLE "tokens" ("id" SERIAL NOT NULL, "blockchainType" "public"."tokens_blockchaintype_enum" NOT NULL, "exchangeId" "public"."tokens_exchangeid_enum" NOT NULL, "address" character varying NOT NULL, "symbol" character varying NOT NULL, "name" character varying NOT NULL, "decimals" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3001e89ada36263dabf1fb6210a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_1fc8c9748b497072859bb0cceb" ON "tokens" ("blockchainType") `);
    await queryRunner.query(`CREATE INDEX "IDX_66ddea115f5596805dea0cd676" ON "tokens" ("exchangeId") `);
    await queryRunner.query(
      `CREATE TYPE "public"."tokens-traded-events_blockchaintype_enum" AS ENUM('ethereum', 'sei-network', 'celo', 'blast')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tokens-traded-events_exchangeid_enum" AS ENUM('ethereum', 'sei', 'celo', 'blast')`,
    );
    await queryRunner.query(
      `CREATE TABLE "tokens-traded-events" ("id" SERIAL NOT NULL, "blockchainType" "public"."tokens-traded-events_blockchaintype_enum" NOT NULL, "exchangeId" "public"."tokens-traded-events_exchangeid_enum" NOT NULL, "trader" character varying NOT NULL, "type" character varying NOT NULL, "sourceAmount" character varying NOT NULL, "targetAmount" character varying NOT NULL, "tradingFeeAmount" character varying NOT NULL, "byTargetAmount" boolean NOT NULL, "transactionIndex" integer NOT NULL, "transactionHash" character varying NOT NULL, "callerId" character varying, "logIndex" integer NOT NULL, "timestamp" TIMESTAMP NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "blockId" integer, "pairId" integer, "sourceTokenId" integer, "targetTokenId" integer, CONSTRAINT "UQ_908649b973c9978cd4235cf1cc9" UNIQUE ("transactionIndex", "transactionHash", "logIndex"), CONSTRAINT "PK_5aa00d572774b0b66ee8ea01314" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c2d17f5848e8253a52408ff189" ON "tokens-traded-events" ("blockchainType") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_25ff1bba41c8559e7094ab3faa" ON "tokens-traded-events" ("exchangeId") `);
    await queryRunner.query(`CREATE INDEX "IDX_bff069546ba7ea84e319446a26" ON "tokens-traded-events" ("blockId") `);
    await queryRunner.query(`CREATE INDEX "IDX_94fd1b26cb2dbeeba497fa79ba" ON "tokens-traded-events" ("callerId") `);
    await queryRunner.query(
      `CREATE TYPE "public"."pairs_blockchaintype_enum" AS ENUM('ethereum', 'sei-network', 'celo', 'blast')`,
    );
    await queryRunner.query(`CREATE TYPE "public"."pairs_exchangeid_enum" AS ENUM('ethereum', 'sei', 'celo', 'blast')`);
    await queryRunner.query(
      `CREATE TABLE "pairs" ("id" SERIAL NOT NULL, "blockchainType" "public"."pairs_blockchaintype_enum" NOT NULL, "exchangeId" "public"."pairs_exchangeid_enum" NOT NULL, "name" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "blockId" integer, "token0Id" integer, "token1Id" integer, CONSTRAINT "PK_bfc550b07b52c37db12aa7d8e69" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_2adf8fe1e85377fa39cba7757b" ON "pairs" ("blockchainType") `);
    await queryRunner.query(`CREATE INDEX "IDX_1d894c6215a2a86d1b5bf661be" ON "pairs" ("exchangeId") `);
    await queryRunner.query(
      `CREATE TYPE "public"."quotes_blockchaintype_enum" AS ENUM('ethereum', 'sei-network', 'celo', 'blast')`,
    );
    await queryRunner.query(
      `CREATE TABLE "quotes" ("id" SERIAL NOT NULL, "blockchainType" "public"."quotes_blockchaintype_enum" NOT NULL, "provider" character varying NOT NULL, "timestamp" TIMESTAMP NOT NULL, "usd" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT ('now'::text)::timestamp(6) with time zone, "updatedAt" TIMESTAMP NOT NULL DEFAULT ('now'::text)::timestamp(6) with time zone, "tokenId" integer, CONSTRAINT "PK_99a0e8bcbcd8719d3a41f23c263" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_f016f6740e3e54b90a08b478ff" ON "quotes" ("blockchainType") `);
    await queryRunner.query(
      `CREATE TYPE "public"."strategies_blockchaintype_enum" AS ENUM('ethereum', 'sei-network', 'celo', 'blast')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."strategies_exchangeid_enum" AS ENUM('ethereum', 'sei', 'celo', 'blast')`,
    );
    await queryRunner.query(
      `CREATE TABLE "strategies" ("id" SERIAL NOT NULL, "blockchainType" "public"."strategies_blockchaintype_enum" NOT NULL, "exchangeId" "public"."strategies_exchangeid_enum" NOT NULL, "strategyId" character varying NOT NULL, "deleted" boolean NOT NULL DEFAULT false, "liquidity0" character varying NOT NULL, "lowestRate0" character varying NOT NULL, "highestRate0" character varying NOT NULL, "marginalRate0" character varying NOT NULL, "liquidity1" character varying NOT NULL, "lowestRate1" character varying NOT NULL, "highestRate1" character varying NOT NULL, "marginalRate1" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "blockId" integer, "pairId" integer, "token0Id" integer, "token1Id" integer, CONSTRAINT "UQ_ca3ef6c54f8acf3f8acd7e14e32" UNIQUE ("blockchainType", "exchangeId", "strategyId"), CONSTRAINT "PK_9a0d363ddf5b40d080147363238" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_2776b53d13ebed1a86d430276f" ON "strategies" ("blockchainType") `);
    await queryRunner.query(`CREATE INDEX "IDX_fa07d821f14ecc71eeae746d69" ON "strategies" ("exchangeId") `);
    await queryRunner.query(`CREATE INDEX "IDX_f2412bf8441578cc42158051ae" ON "strategies" ("strategyId") `);
    await queryRunner.query(
      `CREATE TYPE "public"."tvl_blockchaintype_enum" AS ENUM('ethereum', 'sei-network', 'celo', 'blast')`,
    );
    await queryRunner.query(`CREATE TYPE "public"."tvl_exchangeid_enum" AS ENUM('ethereum', 'sei', 'celo', 'blast')`);
    await queryRunner.query(
      `CREATE TABLE "tvl" ("id" SERIAL NOT NULL, "blockchainType" "public"."tvl_blockchaintype_enum" NOT NULL, "exchangeId" "public"."tvl_exchangeid_enum" NOT NULL, "evt_block_time" TIMESTAMP NOT NULL, "evt_block_number" integer NOT NULL, "strategyId" text NOT NULL, "pairName" text NOT NULL, "pairId" integer NOT NULL, "symbol" text NOT NULL, "address" text NOT NULL, "tvl" text NOT NULL, "reason" text NOT NULL, "transaction_index" text NOT NULL, CONSTRAINT "UQ_837985c1c667096fcb6aba2a437" UNIQUE ("blockchainType", "exchangeId", "strategyId", "pairName", "symbol", "tvl", "address", "evt_block_time", "evt_block_number", "reason", "transaction_index"), CONSTRAINT "PK_8b7a23cbf87dab94680ce91ad20" PRIMARY KEY ("id", "evt_block_time"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_5be44c8aa379657fcef7af663c" ON "tvl" ("blockchainType") `);
    await queryRunner.query(`CREATE INDEX "IDX_2d3ef18dd126f6064fbc6dfa57" ON "tvl" ("exchangeId") `);
    await queryRunner.query(`CREATE INDEX "IDX_5d1a91351a5adac08f8d27d685" ON "tvl" ("evt_block_time") `);
    await queryRunner.query(`CREATE INDEX "IDX_e6721e8c5cc2ba40e2cd79a671" ON "tvl" ("strategyId") `);
    await queryRunner.query(`CREATE INDEX "IDX_df6c25be54ca428bc5a7301679" ON "tvl" ("pairId") `);
    await queryRunner.query(`CREATE INDEX "IDX_bebc452955d5e3bb98e10c9432" ON "tvl" ("reason") `);
    await queryRunner.query(`CREATE INDEX "IDX_87d82627b8d99d3888aca0ebaa" ON "tvl" ("transaction_index") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_488c5516e8c72b2686e744bfed" ON "tvl" ("address", "blockchainType", "exchangeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e8b3d16260b7dea43e343e3366" ON "tvl" ("pairId", "blockchainType", "exchangeId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "volume" ("id" SERIAL NOT NULL, "timestamp" TIMESTAMP NOT NULL, "feeSymbol" character varying NOT NULL, "feeAddress" character varying NOT NULL, "tradingFeeAmountReal" character varying NOT NULL, "tradingFeeAmountUsd" character varying NOT NULL, "targetSymbol" character varying NOT NULL, "targetAddress" character varying NOT NULL, "targetAmountReal" character varying NOT NULL, "targetAmountUsd" character varying NOT NULL, CONSTRAINT "PK_666025cd0c36727216bb7f2a680" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_f01f9db4b67f0fdf2417dbb232" ON "volume" ("timestamp") `);
    await queryRunner.query(
      `CREATE TYPE "public"."pair-created-events_blockchaintype_enum" AS ENUM('ethereum', 'sei-network', 'celo', 'blast')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."pair-created-events_exchangeid_enum" AS ENUM('ethereum', 'sei', 'celo', 'blast')`,
    );
    await queryRunner.query(
      `CREATE TABLE "pair-created-events" ("id" SERIAL NOT NULL, "blockchainType" "public"."pair-created-events_blockchaintype_enum" NOT NULL, "exchangeId" "public"."pair-created-events_exchangeid_enum" NOT NULL, "token0" character varying NOT NULL, "token1" character varying NOT NULL, "transactionIndex" integer NOT NULL, "transactionHash" character varying NOT NULL, "logIndex" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "blockId" integer, CONSTRAINT "UQ_dcc1a2cd3b18918ca3a8b47007d" UNIQUE ("transactionIndex", "transactionHash", "logIndex"), CONSTRAINT "PK_2e5b322880060ee74d19b8d4a07" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8b60bbe8a3935e59d07f9e2084" ON "pair-created-events" ("blockchainType") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_a6f2f1d9ba6aa8dec091ccd1d3" ON "pair-created-events" ("exchangeId") `);
    await queryRunner.query(`CREATE INDEX "IDX_9fdb1161b3305a336be4ae4b83" ON "pair-created-events" ("blockId") `);
    await queryRunner.query(
      `CREATE TYPE "public"."pair-trading-fee-ppm-updated-events_blockchaintype_enum" AS ENUM('ethereum', 'sei-network', 'celo', 'blast')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."pair-trading-fee-ppm-updated-events_exchangeid_enum" AS ENUM('ethereum', 'sei', 'celo', 'blast')`,
    );
    await queryRunner.query(
      `CREATE TABLE "pair-trading-fee-ppm-updated-events" ("id" SERIAL NOT NULL, "blockchainType" "public"."pair-trading-fee-ppm-updated-events_blockchaintype_enum" NOT NULL, "exchangeId" "public"."pair-trading-fee-ppm-updated-events_exchangeid_enum" NOT NULL, "timestamp" TIMESTAMP NOT NULL, "prevFeePPM" integer NOT NULL, "newFeePPM" integer NOT NULL, "transactionIndex" integer NOT NULL, "transactionHash" character varying NOT NULL, "logIndex" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "pairId" integer, "blockId" integer, CONSTRAINT "UQ_9c812bc262cb7467560cf562ad4" UNIQUE ("transactionIndex", "transactionHash", "logIndex"), CONSTRAINT "PK_1020b3004ba5966b027e8a08d54" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3ecc36cb48e31b527dc43f307f" ON "pair-trading-fee-ppm-updated-events" ("blockId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0a2ca9f9e49c70f49970fb9dcf" ON "pair-trading-fee-ppm-updated-events" ("blockchainType") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_13877d16eb7f4665c50993f657" ON "pair-trading-fee-ppm-updated-events" ("exchangeId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."strategy-created-events_blockchaintype_enum" AS ENUM('ethereum', 'sei-network', 'celo', 'blast')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."strategy-created-events_exchangeid_enum" AS ENUM('ethereum', 'sei', 'celo', 'blast')`,
    );
    await queryRunner.query(
      `CREATE TABLE "strategy-created-events" ("id" SERIAL NOT NULL, "strategyId" character varying NOT NULL, "blockchainType" "public"."strategy-created-events_blockchaintype_enum" NOT NULL, "exchangeId" "public"."strategy-created-events_exchangeid_enum" NOT NULL, "timestamp" TIMESTAMP NOT NULL, "owner" character varying NOT NULL, "order0" character varying NOT NULL, "order1" character varying NOT NULL, "transactionIndex" integer NOT NULL, "transactionHash" character varying NOT NULL, "logIndex" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "pairId" integer, "blockId" integer, "token0Id" integer, "token1Id" integer, CONSTRAINT "UQ_52086ff805f342661c5b77bc1ae" UNIQUE ("transactionIndex", "transactionHash", "logIndex"), CONSTRAINT "PK_3121f8f9aa9a96e48e103ef09c1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_00faad78686d13fd0c26264ae8" ON "strategy-created-events" ("strategyId") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_9c5a2e9a334403254efb836f04" ON "strategy-created-events" ("blockId") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_7671de629ff77fbfb76d048416" ON "strategy-created-events" ("blockchainType") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_32ec6fba5ace9de71aa011bf0a" ON "strategy-created-events" ("exchangeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c239f8c77980389a6ed16872d3" ON "strategy-created-events" ("timestamp") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_92fe5683849f39db695c9b4995" ON "strategy-created-events" ("token0Id") `);
    await queryRunner.query(`CREATE INDEX "IDX_d580d7fd7977675aaf649e0b7f" ON "strategy-created-events" ("token1Id") `);
    await queryRunner.query(
      `CREATE TYPE "public"."strategy-updated-events_blockchaintype_enum" AS ENUM('ethereum', 'sei-network', 'celo', 'blast')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."strategy-updated-events_exchangeid_enum" AS ENUM('ethereum', 'sei', 'celo', 'blast')`,
    );
    await queryRunner.query(
      `CREATE TABLE "strategy-updated-events" ("id" SERIAL NOT NULL, "blockchainType" "public"."strategy-updated-events_blockchaintype_enum" NOT NULL, "exchangeId" "public"."strategy-updated-events_exchangeid_enum" NOT NULL, "strategyId" character varying NOT NULL, "timestamp" TIMESTAMP NOT NULL, "reason" integer NOT NULL, "order0" character varying NOT NULL, "order1" character varying NOT NULL, "transactionIndex" integer NOT NULL, "transactionHash" character varying NOT NULL, "logIndex" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "pairId" integer, "blockId" integer, "token0Id" integer, "token1Id" integer, CONSTRAINT "UQ_b206162147f84fc87256bf03b23" UNIQUE ("transactionIndex", "transactionHash", "logIndex"), CONSTRAINT "PK_03ba1851eb69ff0f541a632279f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0c842871c198090f0467451e9d" ON "strategy-updated-events" ("blockchainType") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bc3628a6daaf2e7e169292f4ce" ON "strategy-updated-events" ("exchangeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d8ddb719df9d2a26006b415f98" ON "strategy-updated-events" ("strategyId") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_f6cd36e84afc2fdf1d9cea35ce" ON "strategy-updated-events" ("blockId") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_d2611fb5f6bb25ef81a62b20fb" ON "strategy-updated-events" ("timestamp") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."strategy-deleted-events_blockchaintype_enum" AS ENUM('ethereum', 'sei-network', 'celo', 'blast')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."strategy-deleted-events_exchangeid_enum" AS ENUM('ethereum', 'sei', 'celo', 'blast')`,
    );
    await queryRunner.query(
      `CREATE TABLE "strategy-deleted-events" ("id" SERIAL NOT NULL, "blockchainType" "public"."strategy-deleted-events_blockchaintype_enum" NOT NULL, "exchangeId" "public"."strategy-deleted-events_exchangeid_enum" NOT NULL, "strategyId" character varying NOT NULL, "timestamp" TIMESTAMP NOT NULL, "order0" character varying NOT NULL, "order1" character varying NOT NULL, "transactionIndex" integer NOT NULL, "transactionHash" character varying NOT NULL, "logIndex" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "pairId" integer, "blockId" integer, "token0Id" integer, "token1Id" integer, CONSTRAINT "UQ_9830850139cbddfd88f602fbf50" UNIQUE ("transactionIndex", "transactionHash", "logIndex"), CONSTRAINT "PK_631d016adec08e3c3ae77c267b6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8b93141dbde79a439f8c1bfd46" ON "strategy-deleted-events" ("blockchainType") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2019b1709d451d3739d3e93aa9" ON "strategy-deleted-events" ("exchangeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_19b2559796c490b51ad46c6686" ON "strategy-deleted-events" ("strategyId") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_eac564b54c2e686f3bbbdfb7f7" ON "strategy-deleted-events" ("blockId") `);
    await queryRunner.query(
      `CREATE TYPE "public"."trading-fee-ppm-updated-events_blockchaintype_enum" AS ENUM('ethereum', 'sei-network', 'celo', 'blast')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."trading-fee-ppm-updated-events_exchangeid_enum" AS ENUM('ethereum', 'sei', 'celo', 'blast')`,
    );
    await queryRunner.query(
      `CREATE TABLE "trading-fee-ppm-updated-events" ("id" SERIAL NOT NULL, "blockchainType" "public"."trading-fee-ppm-updated-events_blockchaintype_enum" NOT NULL, "exchangeId" "public"."trading-fee-ppm-updated-events_exchangeid_enum" NOT NULL, "timestamp" TIMESTAMP NOT NULL, "prevFeePPM" integer NOT NULL, "newFeePPM" integer NOT NULL, "transactionIndex" integer NOT NULL, "transactionHash" character varying NOT NULL, "logIndex" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "blockId" integer, CONSTRAINT "UQ_059b582e451654f70bebb491e05" UNIQUE ("transactionIndex", "transactionHash", "logIndex"), CONSTRAINT "PK_c3db6da119f4169b7563d1fdc93" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_af9af71f6ad35cf07505151c41" ON "trading-fee-ppm-updated-events" ("blockchainType") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ec78d4bb8fa7e46d00ec1d26e2" ON "trading-fee-ppm-updated-events" ("exchangeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_aca9132d7db5f0385024667004" ON "trading-fee-ppm-updated-events" ("blockId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."voucher-transfer-events_blockchaintype_enum" AS ENUM('ethereum', 'sei-network', 'celo', 'blast')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."voucher-transfer-events_exchangeid_enum" AS ENUM('ethereum', 'sei', 'celo', 'blast')`,
    );
    await queryRunner.query(
      `CREATE TABLE "voucher-transfer-events" ("id" SERIAL NOT NULL, "blockchainType" "public"."voucher-transfer-events_blockchaintype_enum" NOT NULL, "exchangeId" "public"."voucher-transfer-events_exchangeid_enum" NOT NULL, "strategyId" character varying NOT NULL, "timestamp" TIMESTAMP NOT NULL, "from" character varying NOT NULL, "to" character varying NOT NULL, "transactionIndex" integer NOT NULL, "transactionHash" character varying NOT NULL, "logIndex" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "blockId" integer, CONSTRAINT "UQ_b302936970b7fd28132928c4e77" UNIQUE ("transactionIndex", "transactionHash", "logIndex"), CONSTRAINT "PK_15f265cac4047455031ec2b4e41" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2e20328d5565ff6b3131ae93b5" ON "voucher-transfer-events" ("blockchainType") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3e7da58e7cdefd620d5d780fe8" ON "voucher-transfer-events" ("exchangeId") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_dcceb3e56b344cc9c8c703ae2d" ON "voucher-transfer-events" ("blockId") `);
    await queryRunner.query(
      `ALTER TABLE "tokens-traded-events" ADD CONSTRAINT "FK_bff069546ba7ea84e319446a267" FOREIGN KEY ("blockId") REFERENCES "blocks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tokens-traded-events" ADD CONSTRAINT "FK_c081dde529d0e03627b56844e45" FOREIGN KEY ("pairId") REFERENCES "pairs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tokens-traded-events" ADD CONSTRAINT "FK_c03a21b4dead9ab3345f3ad4902" FOREIGN KEY ("sourceTokenId") REFERENCES "tokens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tokens-traded-events" ADD CONSTRAINT "FK_4bec19484efcbe1a523521c5fe9" FOREIGN KEY ("targetTokenId") REFERENCES "tokens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "pairs" ADD CONSTRAINT "FK_c68180ccb7c24531e2795b294ae" FOREIGN KEY ("blockId") REFERENCES "blocks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "pairs" ADD CONSTRAINT "FK_fc7983e49c0c77fe123cb43b3c9" FOREIGN KEY ("token0Id") REFERENCES "tokens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "pairs" ADD CONSTRAINT "FK_e4001a1eedce46eb130d0d7a941" FOREIGN KEY ("token1Id") REFERENCES "tokens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "quotes" ADD CONSTRAINT "FK_50aa379b097f3082da450455f88" FOREIGN KEY ("tokenId") REFERENCES "tokens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "strategies" ADD CONSTRAINT "FK_0b83ed9a45964f7abc611abf4d7" FOREIGN KEY ("blockId") REFERENCES "blocks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "strategies" ADD CONSTRAINT "FK_f7fb6533dfb9a761cedf52cfc91" FOREIGN KEY ("pairId") REFERENCES "pairs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "strategies" ADD CONSTRAINT "FK_7d86dcba41d17e33e08296701b5" FOREIGN KEY ("token0Id") REFERENCES "tokens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "strategies" ADD CONSTRAINT "FK_849fe4369e56efc231535a9b545" FOREIGN KEY ("token1Id") REFERENCES "tokens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "pair-created-events" ADD CONSTRAINT "FK_9fdb1161b3305a336be4ae4b83d" FOREIGN KEY ("blockId") REFERENCES "blocks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "pair-trading-fee-ppm-updated-events" ADD CONSTRAINT "FK_e709c1f59d782d5586b33e9e8a8" FOREIGN KEY ("pairId") REFERENCES "pairs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "pair-trading-fee-ppm-updated-events" ADD CONSTRAINT "FK_3ecc36cb48e31b527dc43f307f6" FOREIGN KEY ("blockId") REFERENCES "blocks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "strategy-created-events" ADD CONSTRAINT "FK_f1ee68d9ed410aaba255fe984c3" FOREIGN KEY ("pairId") REFERENCES "pairs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "strategy-created-events" ADD CONSTRAINT "FK_9c5a2e9a334403254efb836f04e" FOREIGN KEY ("blockId") REFERENCES "blocks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "strategy-created-events" ADD CONSTRAINT "FK_92fe5683849f39db695c9b4995a" FOREIGN KEY ("token0Id") REFERENCES "tokens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "strategy-created-events" ADD CONSTRAINT "FK_d580d7fd7977675aaf649e0b7f6" FOREIGN KEY ("token1Id") REFERENCES "tokens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "strategy-updated-events" ADD CONSTRAINT "FK_82cb0ebf64bd87a123f7c152d9f" FOREIGN KEY ("pairId") REFERENCES "pairs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "strategy-updated-events" ADD CONSTRAINT "FK_f6cd36e84afc2fdf1d9cea35cec" FOREIGN KEY ("blockId") REFERENCES "blocks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "strategy-updated-events" ADD CONSTRAINT "FK_1eb8296ac6180bbc2e05ef7af3a" FOREIGN KEY ("token0Id") REFERENCES "tokens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "strategy-updated-events" ADD CONSTRAINT "FK_f0be62f9a5e4fe9a02b57c4c02f" FOREIGN KEY ("token1Id") REFERENCES "tokens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "strategy-deleted-events" ADD CONSTRAINT "FK_ddac7ee8a786ed10b4bf750b511" FOREIGN KEY ("pairId") REFERENCES "pairs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "strategy-deleted-events" ADD CONSTRAINT "FK_eac564b54c2e686f3bbbdfb7f74" FOREIGN KEY ("blockId") REFERENCES "blocks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "strategy-deleted-events" ADD CONSTRAINT "FK_f7bc0579a75b1d5106c772a3b20" FOREIGN KEY ("token0Id") REFERENCES "tokens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "strategy-deleted-events" ADD CONSTRAINT "FK_0a5bda86b666abda143f8ce0f53" FOREIGN KEY ("token1Id") REFERENCES "tokens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "trading-fee-ppm-updated-events" ADD CONSTRAINT "FK_aca9132d7db5f03850246670044" FOREIGN KEY ("blockId") REFERENCES "blocks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "voucher-transfer-events" ADD CONSTRAINT "FK_dcceb3e56b344cc9c8c703ae2d4" FOREIGN KEY ("blockId") REFERENCES "blocks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE`);
    await queryRunner.query(`SELECT create_hypertable('historic-quotes', 'timestamp')`);
    await queryRunner.query(`SELECT create_hypertable('tvl', 'evt_block_time')`);
    await queryRunner.query(
      `CREATE INDEX "IDX_token_address_desc" ON "historic-quotes" ("tokenAddress", "timestamp" DESC) INCLUDE (id, "blockchainType", provider, usd)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "voucher-transfer-events" DROP CONSTRAINT "FK_dcceb3e56b344cc9c8c703ae2d4"`);
    await queryRunner.query(
      `ALTER TABLE "trading-fee-ppm-updated-events" DROP CONSTRAINT "FK_aca9132d7db5f03850246670044"`,
    );
    await queryRunner.query(`ALTER TABLE "strategy-deleted-events" DROP CONSTRAINT "FK_0a5bda86b666abda143f8ce0f53"`);
    await queryRunner.query(`ALTER TABLE "strategy-deleted-events" DROP CONSTRAINT "FK_f7bc0579a75b1d5106c772a3b20"`);
    await queryRunner.query(`ALTER TABLE "strategy-deleted-events" DROP CONSTRAINT "FK_eac564b54c2e686f3bbbdfb7f74"`);
    await queryRunner.query(`ALTER TABLE "strategy-deleted-events" DROP CONSTRAINT "FK_ddac7ee8a786ed10b4bf750b511"`);
    await queryRunner.query(`ALTER TABLE "strategy-updated-events" DROP CONSTRAINT "FK_f0be62f9a5e4fe9a02b57c4c02f"`);
    await queryRunner.query(`ALTER TABLE "strategy-updated-events" DROP CONSTRAINT "FK_1eb8296ac6180bbc2e05ef7af3a"`);
    await queryRunner.query(`ALTER TABLE "strategy-updated-events" DROP CONSTRAINT "FK_f6cd36e84afc2fdf1d9cea35cec"`);
    await queryRunner.query(`ALTER TABLE "strategy-updated-events" DROP CONSTRAINT "FK_82cb0ebf64bd87a123f7c152d9f"`);
    await queryRunner.query(`ALTER TABLE "strategy-created-events" DROP CONSTRAINT "FK_d580d7fd7977675aaf649e0b7f6"`);
    await queryRunner.query(`ALTER TABLE "strategy-created-events" DROP CONSTRAINT "FK_92fe5683849f39db695c9b4995a"`);
    await queryRunner.query(`ALTER TABLE "strategy-created-events" DROP CONSTRAINT "FK_9c5a2e9a334403254efb836f04e"`);
    await queryRunner.query(`ALTER TABLE "strategy-created-events" DROP CONSTRAINT "FK_f1ee68d9ed410aaba255fe984c3"`);
    await queryRunner.query(
      `ALTER TABLE "pair-trading-fee-ppm-updated-events" DROP CONSTRAINT "FK_3ecc36cb48e31b527dc43f307f6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pair-trading-fee-ppm-updated-events" DROP CONSTRAINT "FK_e709c1f59d782d5586b33e9e8a8"`,
    );
    await queryRunner.query(`ALTER TABLE "pair-created-events" DROP CONSTRAINT "FK_9fdb1161b3305a336be4ae4b83d"`);
    await queryRunner.query(`ALTER TABLE "strategies" DROP CONSTRAINT "FK_849fe4369e56efc231535a9b545"`);
    await queryRunner.query(`ALTER TABLE "strategies" DROP CONSTRAINT "FK_7d86dcba41d17e33e08296701b5"`);
    await queryRunner.query(`ALTER TABLE "strategies" DROP CONSTRAINT "FK_f7fb6533dfb9a761cedf52cfc91"`);
    await queryRunner.query(`ALTER TABLE "strategies" DROP CONSTRAINT "FK_0b83ed9a45964f7abc611abf4d7"`);
    await queryRunner.query(`ALTER TABLE "quotes" DROP CONSTRAINT "FK_50aa379b097f3082da450455f88"`);
    await queryRunner.query(`ALTER TABLE "pairs" DROP CONSTRAINT "FK_e4001a1eedce46eb130d0d7a941"`);
    await queryRunner.query(`ALTER TABLE "pairs" DROP CONSTRAINT "FK_fc7983e49c0c77fe123cb43b3c9"`);
    await queryRunner.query(`ALTER TABLE "pairs" DROP CONSTRAINT "FK_c68180ccb7c24531e2795b294ae"`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" DROP CONSTRAINT "FK_4bec19484efcbe1a523521c5fe9"`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" DROP CONSTRAINT "FK_c03a21b4dead9ab3345f3ad4902"`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" DROP CONSTRAINT "FK_c081dde529d0e03627b56844e45"`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" DROP CONSTRAINT "FK_bff069546ba7ea84e319446a267"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_dcceb3e56b344cc9c8c703ae2d"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_3e7da58e7cdefd620d5d780fe8"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2e20328d5565ff6b3131ae93b5"`);
    await queryRunner.query(`DROP TABLE "voucher-transfer-events"`);
    await queryRunner.query(`DROP TYPE "public"."voucher-transfer-events_exchangeid_enum"`);
    await queryRunner.query(`DROP TYPE "public"."voucher-transfer-events_blockchaintype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_aca9132d7db5f0385024667004"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ec78d4bb8fa7e46d00ec1d26e2"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_af9af71f6ad35cf07505151c41"`);
    await queryRunner.query(`DROP TABLE "trading-fee-ppm-updated-events"`);
    await queryRunner.query(`DROP TYPE "public"."trading-fee-ppm-updated-events_exchangeid_enum"`);
    await queryRunner.query(`DROP TYPE "public"."trading-fee-ppm-updated-events_blockchaintype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_eac564b54c2e686f3bbbdfb7f7"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_19b2559796c490b51ad46c6686"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2019b1709d451d3739d3e93aa9"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8b93141dbde79a439f8c1bfd46"`);
    await queryRunner.query(`DROP TABLE "strategy-deleted-events"`);
    await queryRunner.query(`DROP TYPE "public"."strategy-deleted-events_exchangeid_enum"`);
    await queryRunner.query(`DROP TYPE "public"."strategy-deleted-events_blockchaintype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d2611fb5f6bb25ef81a62b20fb"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_f6cd36e84afc2fdf1d9cea35ce"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d8ddb719df9d2a26006b415f98"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_bc3628a6daaf2e7e169292f4ce"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_0c842871c198090f0467451e9d"`);
    await queryRunner.query(`DROP TABLE "strategy-updated-events"`);
    await queryRunner.query(`DROP TYPE "public"."strategy-updated-events_exchangeid_enum"`);
    await queryRunner.query(`DROP TYPE "public"."strategy-updated-events_blockchaintype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d580d7fd7977675aaf649e0b7f"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_92fe5683849f39db695c9b4995"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c239f8c77980389a6ed16872d3"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_32ec6fba5ace9de71aa011bf0a"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7671de629ff77fbfb76d048416"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_9c5a2e9a334403254efb836f04"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_00faad78686d13fd0c26264ae8"`);
    await queryRunner.query(`DROP TABLE "strategy-created-events"`);
    await queryRunner.query(`DROP TYPE "public"."strategy-created-events_exchangeid_enum"`);
    await queryRunner.query(`DROP TYPE "public"."strategy-created-events_blockchaintype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_13877d16eb7f4665c50993f657"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_0a2ca9f9e49c70f49970fb9dcf"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_3ecc36cb48e31b527dc43f307f"`);
    await queryRunner.query(`DROP TABLE "pair-trading-fee-ppm-updated-events"`);
    await queryRunner.query(`DROP TYPE "public"."pair-trading-fee-ppm-updated-events_exchangeid_enum"`);
    await queryRunner.query(`DROP TYPE "public"."pair-trading-fee-ppm-updated-events_blockchaintype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_9fdb1161b3305a336be4ae4b83"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a6f2f1d9ba6aa8dec091ccd1d3"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8b60bbe8a3935e59d07f9e2084"`);
    await queryRunner.query(`DROP TABLE "pair-created-events"`);
    await queryRunner.query(`DROP TYPE "public"."pair-created-events_exchangeid_enum"`);
    await queryRunner.query(`DROP TYPE "public"."pair-created-events_blockchaintype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_f01f9db4b67f0fdf2417dbb232"`);
    await queryRunner.query(`DROP TABLE "volume"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e8b3d16260b7dea43e343e3366"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_488c5516e8c72b2686e744bfed"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_87d82627b8d99d3888aca0ebaa"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_bebc452955d5e3bb98e10c9432"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_df6c25be54ca428bc5a7301679"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e6721e8c5cc2ba40e2cd79a671"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_5d1a91351a5adac08f8d27d685"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2d3ef18dd126f6064fbc6dfa57"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_5be44c8aa379657fcef7af663c"`);
    await queryRunner.query(`DROP TABLE "tvl"`);
    await queryRunner.query(`DROP TYPE "public"."tvl_exchangeid_enum"`);
    await queryRunner.query(`DROP TYPE "public"."tvl_blockchaintype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_f2412bf8441578cc42158051ae"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_fa07d821f14ecc71eeae746d69"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2776b53d13ebed1a86d430276f"`);
    await queryRunner.query(`DROP TABLE "strategies"`);
    await queryRunner.query(`DROP TYPE "public"."strategies_exchangeid_enum"`);
    await queryRunner.query(`DROP TYPE "public"."strategies_blockchaintype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_f016f6740e3e54b90a08b478ff"`);
    await queryRunner.query(`DROP TABLE "quotes"`);
    await queryRunner.query(`DROP TYPE "public"."quotes_blockchaintype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_1d894c6215a2a86d1b5bf661be"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2adf8fe1e85377fa39cba7757b"`);
    await queryRunner.query(`DROP TABLE "pairs"`);
    await queryRunner.query(`DROP TYPE "public"."pairs_exchangeid_enum"`);
    await queryRunner.query(`DROP TYPE "public"."pairs_blockchaintype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_94fd1b26cb2dbeeba497fa79ba"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_bff069546ba7ea84e319446a26"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_25ff1bba41c8559e7094ab3faa"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c2d17f5848e8253a52408ff189"`);
    await queryRunner.query(`DROP TABLE "tokens-traded-events"`);
    await queryRunner.query(`DROP TYPE "public"."tokens-traded-events_exchangeid_enum"`);
    await queryRunner.query(`DROP TYPE "public"."tokens-traded-events_blockchaintype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_66ddea115f5596805dea0cd676"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_1fc8c9748b497072859bb0cceb"`);
    await queryRunner.query(`DROP TABLE "tokens"`);
    await queryRunner.query(`DROP TYPE "public"."tokens_exchangeid_enum"`);
    await queryRunner.query(`DROP TYPE "public"."tokens_blockchaintype_enum"`);
    await queryRunner.query(`DROP TABLE "last_processed_block"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_5ab5c8ab52bc42e68dcbc96558"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ab617affe46aa00bdd295edce0"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_51502c505f256a69be325a6345"`);
    await queryRunner.query(`DROP TABLE "historic-quotes"`);
    await queryRunner.query(`DROP TYPE "public"."historic-quotes_blockchaintype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_6d88b5ea8a96fc81e3b0d52f42"`);
    await queryRunner.query(`DROP TABLE "blocks"`);
    await queryRunner.query(`DROP TYPE "public"."blocks_blockchaintype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_9898af294babb482eaa412cc09"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_9001cd379d53da60d57f5231d0"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_9c9b6d29467f616fc2c36de948"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_fd16c05b698b362ae70e600002"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_19f959f0c1d781ee56011fc54a"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_f9933081beb56daabab983bb9b"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_330e316f8c4fcf8c1c67fb5c27"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ed7d7cafd4008a96ea01f84e8d"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_92287e565a13c640a4a6d0bd2f"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_aff636fa5ca427c38c0d9e7dd4"`);
    await queryRunner.query(`DROP TABLE "activities"`);
    await queryRunner.query(`DROP TYPE "public"."activities_exchangeid_enum"`);
    await queryRunner.query(`DROP TYPE "public"."activities_blockchaintype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_token_address_desc"`);
  }
}

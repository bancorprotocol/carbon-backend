#!/bin/bash
set -euo pipefail

bold()   { printf "\033[1m%s\033[0m\n" "$*"; }
cyan()   { printf "\033[0;36m%s\033[0m\n" "$*"; }
yellow() { printf "\033[1;33m%s\033[0m\n" "$*"; }

cat <<EOF
$(cyan "Carbon-backend dev scripts — what each npm command does")

$(bold "DB (local Postgres)")

  $(yellow "npm run db:seed -- --deployment=<ethereum|sei|celo|coti>")
      Fast targeted import from the prod readonly DB (EXTERNAL_DATABASE_*)
      into your local DATABASE_URL for ONE deployment. Default deployment is
      ethereum. Assumes local schema already exists — run \`npm start\` or
      \`npm run migration:run\` once first.

  $(yellow "npm run db:seed:test")
      Inserts hand-crafted gradient + Carbon-shaped strategies into the local
      DB so a running server returns mixed regular + gradient API responses.
      Pass -- --clean to wipe previously seeded rows first.

$(bold "Tenderly fork lifecycle (manual / interactive use)")

  $(yellow "npm run tenderly:create")
      Creates a fresh Tenderly virtual testnet (mainnet fork). The fork
      inherits the mainnet CarbonController + GradientController state, so
      no contracts need to be deployed onto it. Writes .env.tenderly with
      the RPC URL and prints a curl command for booting a preview backend
      against the fork.

      Pass --run to also start the local backend with harvesting enabled
      (IS_FORK=1, SHOULD_HARVEST=1) against the new testnet:
          npm run tenderly:create -- --run

      Requires: TENDERLY_ACCESS_KEY/USERNAME/PROJECT, jq, curl

  $(yellow "npm run tenderly:delete")
      Deletes a Tenderly testnet previously created by :create.
      Pass the testnet id as an argument:
          npm run tenderly:delete -- vnet_xxx
      Also removes the matching .env.tenderly if it points at the same id.

  $(yellow "npm run tenderly:seed")
      Populates the Tenderly fork with Carbon AND gradient activity:
      3 pairs (DAI/USDC, WBTC/USDC, LINK/DAI), strategies on both
      CarbonController and GradientController, trades in both directions,
      one update and one deletion per controller, signed by the
      deterministic Hardhat test wallets (Alice/Bob/Carol so the FE can
      sign in deterministically). Triggers every event the backend
      harvests. Requires .env.tenderly (from :create).

$(bold "Automated test suites (CI / pre-merge checks)")

  $(yellow "npm run test:integration")
      DB-only integration test. Fully automated:
        1. Seeds DB with synthetic Carbon + gradient data (db:seed:test --clean)
        2. Starts backend with SHOULD_HARVEST=0, SHOULD_UPDATE_ANALYTICS=1
        3. Runs test:verify against all 39 API endpoints
        4. Tears the server down
      No Tenderly, no contracts — pure backend code path.

  $(yellow "npm run test:e2e")
      Full end-to-end test against a Tenderly fork. Fully automated:
        1. Creates a Tenderly VNet (inherits mainnet Carbon + Gradient state)
        2. Runs tenderly:seed to create on-chain Carbon + gradient activity
        3. Starts backend with harvesting (IS_FORK=1, SHOULD_HARVEST=1)
        4. Polls until gradient strategies are harvested
        5. Runs DB verification + test:verify --mode=e2e
        6. Tears down server + deletes the Tenderly testnet
      This is the heaviest test — it exercises contracts, harvesting,
      analytics, and every API endpoint together.

  $(yellow "npm run test:verify")
      Hits every API endpoint on a running carbon-backend and asserts that
      Carbon + gradient data is correctly mixed into the responses
      (39 endpoints, 17 controllers). Called by test:integration and
      test:e2e at the end; also runnable ad-hoc.
      Modes:
          --mode=integration (default)  asserts against db:seed:test values
          --mode=e2e                    asserts against Tenderly-harvested values
          --base-url=http://...         target a non-default host

$(bold "Typical workflows")

  Fast local dev setup:
    npm start                            # creates schema via DB_SYNC=1
    npm run db:seed -- --deployment=celo # pulls fresh data for one deployment

  Just want to manually poke at a fresh fork:
    npm run tenderly:create -- --run
    # ... develop ...
    npm run tenderly:delete -- <id>

  Hand a frontend dev a fork pre-loaded with every scenario:
    npm run tenderly:create     # deploy contracts, write .env.tenderly
    npm run tenderly:seed       # 3 pairs, all 6 gradient types, trades, transfers, ...
    # Then either run the backend locally (tenderly:create -- --run on the same id)
    # or POST the preview-backend curl printed by :create.

  Pre-merge sanity (fast, no Tenderly):
    npm run test:integration

  Pre-merge full E2E (slow, hits Tenderly):
    npm run test:e2e
EOF

// import { ethers } from 'https://cdn.skypack.dev/ethers@v5.7.2';

// let CHAIN_ID;
// const PROVIDER = 'http://chain-provider';

// const FastLaneArbEvents = [
//   'event ArbitrageExecuted(address indexed caller, uint16[] platformIds, address[] tokenPath, address[] sourceTokens, uint256[] sourceAmounts, uint256[] protocolAmounts, uint256[] rewardAmounts)',
// ];

// export async function triggerHandler(context, data) {
//   try {
//     CHAIN_ID = Number(context.chainId);

//     const eventsParser = new ethers.utils.Interface(FastLaneArbEvents);
//     const parsedEvent = eventsParser.parseLog(data);
//     const txHash = context.txHash;
//     const blockTime = new Date(context.blockTimestamp).toLocaleString();
//     const message = await handleArbitrageExecuted(txHash, blockTime, parsedEvent);
//     const suffix = '\n\nPowered by [SendBlocks](<https://sendblocks.io>)';
//     return message + suffix;
//   } catch (error) {
//     console.error(error);
//     return;
//   }
// }

// async function handleArbitrageExecuted(transactionHash, blockTime, parsedEvent) {
//   const sourceTokens = parsedEvent.args.sourceTokens;
//   const numSourceTokens = sourceTokens.length;

//   let tokenMessages = '';
//   if (numSourceTokens == 1) {
//     const tokenInfo = new Token(sourceTokens[0]);
//     await tokenInfo.getInfo();

//     tokenMessages = `Token: ${tokenInfo.symbol}
// Protocol amount: ${tokenInfo.amountUSD(parsedEvent.args.protocolAmounts[0], 6)}
// Caller amount: ${tokenInfo.amountUSD(parsedEvent.args.rewardAmounts[0], 6)}`;
//   } else {
//     tokenMessages += 'Multiple Arb\n';

//     for (let i = 0; i < numSourceTokens; i++) {
//       const tokenInfo = new Token(sourceTokens[i]);
//       await tokenInfo.getInfo();

//       tokenMessages += `Token ${i + 1}: ${tokenInfo.symbol}
// Protocol amount: ${tokenInfo.amountUSD(parsedEvent.args.protocolAmounts[i], 6)}
// Caller amount: ${tokenInfo.amountUSD(parsedEvent.args.rewardAmounts[i], 6)}`;
//     }
//   }

//   const message = `**Arb Fast Lane - Ethereum**

// ${tokenMessages}

// 🗓️ ${blockTime}
// ⛓️ Tx hash: [View](<https://etherscan.io/tx/${transactionHash}>)`;

//   return message;
// }

// const CHAIN_TO_GECKO_ID = {
//   1: 'ethereum',
//   250: 'fantom',
//   5000: 'mantle',
//   8453: 'base',
//   59144: 'linea',
// };

// class Token {
//   address;
//   symbol;
//   name;
//   decimals;
//   price;

//   constructor(address) {
//     this.address = ethers.utils.getAddress(address);
//   }

//   async getInfo() {
//     if (this.address == '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
//       switch (CHAIN_ID) {
//         case 1: // Ethereum
//           this.symbol = 'ETH';
//           this.name = 'Ether';
//           this.decimals = 18;
//           this.price = await getLlamaPrice('coingecko', 'ethereum');
//           return;
//         case 8453: // Base
//           this.symbol = 'ETH';
//           this.name = 'Ether';
//           this.decimals = 18;
//           this.price = await getLlamaPrice('coingecko', 'ethereum');
//           return;
//         case 59144: // Linea
//           this.symbol = 'ETH';
//           this.name = 'Ether';
//           this.decimals = 18;
//           this.price = await getLlamaPrice('coingecko', 'ethereum');
//           return;
//         case 250: // Fantom
//           this.symbol = 'FTM';
//           this.name = 'Fantom';
//           this.decimals = 18;
//           this.price = await getLlamaPrice('coingecko', 'fantom');
//           return;
//         case 5000: // Mantle
//           this.symbol = 'MNT';
//           this.name = 'Mantle';
//           this.decimals = 18;
//           this.price = await getLlamaPrice('coingecko', 'mantle');
//           return;
//         default:
//           throw new Error(`Chain ID ${CHAIN_ID} not supported!`);
//       }
//     }

//     const provider = new ethers.providers.JsonRpcProvider(PROVIDER);

//     const erc20Abi = [
//       'function symbol() view returns (string)',
//       'function decimals() view returns (uint8)',
//       'function name() view returns (string)',
//     ];
//     const tokenContract = new ethers.Contract(this.address, erc20Abi, provider);

//     try {
//       this.symbol = await tokenContract.symbol();
//     } catch {
//       this.symbol = 'N/A';
//     }
//     try {
//       this.name = await tokenContract.name();
//     } catch {
//       this.name = this.symbol;
//     }

//     this.decimals = await tokenContract.decimals();

//     const geckoId = CHAIN_TO_GECKO_ID[CHAIN_ID];

//     try {
//       this.price = await getGeckoPrice(geckoId, this.address);
//     } catch {
//       try {
//         this.price = await getLlamaPrice(geckoId, this.address);
//       } catch {
//         this.price = undefined;
//       }
//     }
//   }

//   amountUSD(amount, precision) {
//     if (!this.price) {
//       return 'N/A';
//     }
//     const tokenAmount = Number(ethers.utils.formatUnits(amount, this.decimals));
//     const usdAmount = tokenAmount * this.price;
//     return '$' + printNumber(usdAmount, precision);
//   }

//   amountToken(amount, precision) {
//     const tokenAmount = Number(ethers.utils.formatUnits(amount, this.decimals));
//     return printNumber(tokenAmount, precision);
//   }
// }

// async function getLlamaPrice(geckoId, tokenAddress) {
//   const chainAndToken = `${geckoId}:${tokenAddress}`;
//   const endpoint = `https://coins.llama.fi/prices/current/${chainAndToken}`;

//   const price = await fetch(endpoint).then((response) => {
//     if (response.ok) {
//       return response.json();
//     }
//     throw new Error(`DefiLlama returned an error: ${response.status} ${response.statusText}`);
//   });

//   if (price.coins[chainAndToken]) {
//     return price.coins[chainAndToken].price;
//   }

//   throw new Error(`DefiLlama: Token ${tokenAddress} not found on ${geckoId}!`);
// }

// async function getGeckoPrice(geckoId, tokenAddress) {
//   const outputCurrency = 'usd';
//   const endpoint = `https://api.coingecko.com/api/v3/simple/token_price/${geckoId}?contract_addresses=${tokenAddress}&vs_currencies=${outputCurrency}`;

//   const price = await fetch(endpoint).then((response) => {
//     if (response.ok) {
//       return response.json();
//     }
//     throw new Error(`CoinGecko returned an error: ${response.status} ${response.statusText}`);
//   });

//   const lowerTokenAddress = tokenAddress.toLowerCase();
//   if (price[lowerTokenAddress]) {
//     return price[lowerTokenAddress][outputCurrency];
//   }

//   throw new Error(`CoinGecko: Token ${tokenAddress} not found on ${geckoId}!`);
// }

// function toSubscript(num) {
//   const subscriptMap = {
//     '0': '₀',
//     '1': '₁',
//     '2': '₂',
//     '3': '₃',
//     '4': '₄',
//     '5': '₅',
//     '6': '₆',
//     '7': '₇',
//     '8': '₈',
//     '9': '₉',
//   };
//   return num
//     .toString()
//     .split('')
//     .map((digit) => subscriptMap[digit] || digit)
//     .join('');
// }

// function printNumber(num, precision) {
//   if (num < 0.01) {
//     const numZeros = Math.abs(Math.floor(Math.log10(num))) - 1;
//     const numStr = num.toFixed(20);
//     const sigFigs = numStr.slice(2 + numZeros, 2 + numZeros + precision);

//     const trailingZeros = `0.0${toSubscript(numZeros)}${sigFigs}`;
//     // Remove trailing zeros
//     return trailingZeros.replace(/\.?0+$/, '');
//   } else if (num < 1000) {
//     return num.toPrecision(precision);
//   } else {
//     // Print the number as is (no scientific notation) with 0 decimal places
//     return num.toFixed();
//   }
// }

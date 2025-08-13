// src/viem/clients.ts
import { createPublicClient, fallback, http } from "viem";
import { hyperEVM } from "../chains/hyperEVM";

export const hyperPublicClient = createPublicClient({
  chain: hyperEVM,
  transport: fallback(
    [
      http("https://1rpc.io/hyperliquid", { batch: true }),
      http("https://hyperliquid-mainnet.g.alchemy.com/public", { batch: true }),
      http("https://999.rpc.thirdweb.com", { batch: true }),
      http("https://rpc.hyperliquid.xyz/evm", { batch: true }), // keep official last
    ],
    { retryCount: 2, retryDelay: 300 }
  ),
});
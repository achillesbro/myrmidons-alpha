import { useState, useEffect } from "react";
import { useWalletClient, useAccount } from "wagmi";
import { useGetUserSDKVaultPositions } from "../hooks/useGetUserSDKVaultPosition";
import { Address, formatUnits, parseEther } from "viem";
import { hyperPublicClient } from "../viem/clients";
import { useHyperTxHistory } from "../hooks/useHyperTxHistory";
import { hyperEVM } from "../chains/hyperEVM";
//import { depositUsingBundler, withdrawUsingBundler } from "../service/actions";
//import { Vault } from "@morpho-org/blue-sdk";
import { BrowserProvider, Contract } from "ethers";
import { JsonRpcProvider } from "ethers";
import vaultAbi from "../abis/Vault.json";
import { useTokenBalance } from "../hooks/useTokenBalance";
// Minimal ERC-20 ABI for balanceOf()
const erc20Abi = [
  "function balanceOf(address owner) view returns (uint256)"
];
import { useGetVaultTransactionsQuery } from "../graphql/__generated__/GetVaultTransactions.query.generated";
import { useGetVaultDisplayQuery } from "../graphql/__generated__/GetVaultDisplay.query.generated";

export function TransactionHistory({ vaultAddress }: { vaultAddress: Address }) {
  const { address: userAddress } = useAccount();
  const client = useWalletClient();
  const chainId = client.data?.chain?.id;

  // Compute a capped fromBlock for HyperEVM (avoid scanning from genesis)
  const [fromBlock, setFromBlock] = useState<bigint | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function computeFromBlock() {
      if (chainId === 999) {
        try {
          const pc = hyperPublicClient;
          const head = await pc.getBlockNumber();
          const LOOKBACK = 10_000n; // last N blocks only
          const start = head > LOOKBACK ? head - LOOKBACK : 0n;
          if (!cancelled) setFromBlock(start);
        } catch {
          if (!cancelled) setFromBlock(0n);
        }
      } else {
        if (!cancelled) setFromBlock(null);
      }
    }
    computeFromBlock();
    return () => { cancelled = true; };
  }, [chainId]);

  // ✅ Call BOTH hooks every render (consistent order)
  const { data: subgraphData, loading: subgraphLoading, error: subgraphError } =
    useGetVaultTransactionsQuery({
      pollInterval: 10000,
      fetchPolicy: "network-only",
      skip: chainId === 999, // skip fetching, but hook still called
    });

  const { data: hyperData, loading: hyperLoading, error: hyperError } = useHyperTxHistory({
    vaultAddress,
    userAddress: userAddress as Address | undefined,
    fromBlock: fromBlock ?? 0n,
    enabled: chainId === 999 && fromBlock !== null, // 🔑
  });

  // ----- Render -----
  if (!userAddress) return <p className="text-sm text-gray-400">Connect wallet to see history</p>;

  if (chainId === 999) {
    if (fromBlock === null || hyperLoading) return <p>Loading history…</p>;
    if (hyperError) return <p className="text-sm text-red-500">Error: {hyperError}</p>;
    const rows = hyperData ?? [];
    if (rows.length === 0) return <p className="text-sm text-gray-400">No transactions for your wallet.</p>;
    return (
      <div className="space-y-2">
        {rows.map((tx) => (
          <div key={`${tx.hash}-${tx.logIndex}`} className="bg-[#121212] border border-gray-700 rounded-md p-2 text-sm flex justify-between">
            <span>{new Date(tx.timestamp * 1000).toLocaleString()}</span>
            <span className="font-mono truncate">{tx.hash}</span>
            <span>{tx.type}</span>
          </div>
        ))}
      </div>
    );
  }

  // Non-HyperEVM: subgraph path
  if (subgraphLoading) return <p>Loading history…</p>;
  if (subgraphError) return <p className="text-sm text-red-500">Error: {subgraphError.message}</p>;
  const items = subgraphData?.transactions?.items ?? [];
  const filtered = items.filter((t) => t.user?.address?.toLowerCase?.() === userAddress.toLowerCase());
  if (filtered.length === 0) return <p className="text-sm text-gray-400">No transactions for your wallet.</p>;

  return (
    <div className="space-y-2">
      {filtered.map((t) => (
        <div key={t.hash} className="bg-[#121212] border border-gray-700 rounded-md p-2 text-sm flex justify-between">
          <span>{new Date(Number(t.timestamp) * 1000).toLocaleString()}</span>
          <span className="font-mono truncate">{t.hash}</span>
          <span>{t.type}</span>
        </div>
      ))}
    </div>
  );
}

export function VaultSdkView({ vaultAddress }: { vaultAddress: Address }) {
  const [testResults, setTestResults] = useState<string[]>([]);
  const [isFullWithdraw, setIsFullWithdraw] = useState(false);
  const [inputs, setInputs] = useState({
    amountToDeposit: "0.1",
    amountToWithdraw: "0.1",
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setInputs((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const client = useWalletClient();
  const { address: userAddress } = useAccount();
  const chainId = client.data?.chain?.id;

  // On-chain position for HyperEVM (chain 999)
  const [onchainPosition, setOnchainPosition] = useState<{ shares: bigint; assets: bigint } | null>(null);
  const [posLoading, setPosLoading] = useState(false);
  const [posError, setPosError] = useState<string | null>(null);

  // On-chain token balance for HyperEVM (chain 999)
  const [onchainBalance, setOnchainBalance] = useState<bigint | null>(null);
  const [balLoading, setBalLoading] = useState(false);
  const [balError, setBalError] = useState<string | null>(null);
  useEffect(() => {
    if (chainId === 999 && userAddress) {
      setBalLoading(true);
      const provider = new BrowserProvider(window.ethereum as any);
      const vaultContract = new Contract(vaultAddress, vaultAbi, provider);
      vaultContract
        .asset()
        .then((underlyingAddr: string) => {
          const tokenContract = new Contract(underlyingAddr, erc20Abi, provider);
          return tokenContract.balanceOf(userAddress);
        })
        .then((bal: bigint) => {
          setOnchainBalance(bal);
          setBalLoading(false);
        })
        .catch((e: any) => {
          setBalError(e.message);
          setBalLoading(false);
        });
    }
  }, [chainId, userAddress, vaultAddress]);

  useEffect(() => {
    if (chainId === 999 && userAddress) {
      setPosLoading(true);
      const provider = new BrowserProvider(window.ethereum as any);
      const vaultContract = new Contract(
        vaultAddress,
        vaultAbi,
        provider
      );
      vaultContract
        .balanceOf(userAddress)
        .then((shares: bigint) =>
          vaultContract.convertToAssets(shares).then((assets: bigint) => {
            setOnchainPosition({ shares, assets });
            setPosLoading(false);
          })
        )
        .catch((e: any) => {
          setPosError(e.message);
          setPosLoading(false);
        });
    }
  }, [chainId, userAddress, vaultAddress]);

  const {
    position,
    isLoading: positionLoading,
    error: positionError,
  } = useGetUserSDKVaultPositions(vaultAddress);

  const {
    tokenBalance,
    isLoading: tokenBalanceLoading,
    error: tokenBalanceError,
  } = useTokenBalance(
    position?.underlyingAddress || "0x0000000000000000000000000000000000000000"
  );

  // Fetch vault metrics (TVL, APY, price)
  const { data: vaultData } = useGetVaultDisplayQuery({
    skip: !vaultAddress,
    fetchPolicy: "cache-and-network",
  });

  const netApy            = vaultData?.vaultByAddress.state?.netApy ?? 0;
  const priceUsd          = vaultData?.vaultByAddress.asset.priceUsd ?? 0;

  // Compute current underlying amount from position
  const underlyingWei = position
    ? (position.depositedAssets * position.shareToUnderlying) / BigInt(1e18)
    : BigInt(0);
  const underlyingAmount = Number(underlyingWei) / 1e18;

  const currentValueUsd   = underlyingAmount * priceUsd;
  const annualEarningsUsd = currentValueUsd * netApy;
  const monthlyEarningsUsd = annualEarningsUsd / 12;

  const runDeposit = async () => {
    // Clear previous results first
    setTestResults([]);

    if (!client.data || !client.data.account) {
      setTestResults(["Please connect your wallet first"]);
      return;
    }

    try {
      // Convert input values to BigInt using parseEther.
      const depositAmountWei = parseEther(inputs.amountToDeposit);
      // 1) Get an ethers.js signer from the user’s wallet
      const provider = new BrowserProvider(window.ethereum as any);
      const signer   = await provider.getSigner();
      const userAddr = await signer.getAddress();

      // 2) Instantiate the vault contract with your ABI
      const vaultContract = new Contract(
        vaultAddress,
        vaultAbi,
        signer
      );
      // 0) Determine the underlying token address
      let underlyingAddress: string;
      if (chainId === 999) {
        // On HyperEVM, read directly from contract
        underlyingAddress = await vaultContract.asset();
      } else {
        // On supported chains, use the SDK-provided position
        underlyingAddress = position?.underlyingAddress as string;
      }
      if (!underlyingAddress) {
        throw new Error("No underlying token");
      }

      // 0.5) Check vault deposit cap
      const cap: bigint = await vaultContract.maxDeposit(userAddr);
      if (depositAmountWei > cap) {
        setTestResults((prev) => [
          ...prev,
          `Vault not open for deposits (current cap: ${cap.toString()})`,
        ]);
        return;
      }

      // 1) Instantiate ERC-20 contract and approve
      const tokenContract = new Contract(
        underlyingAddress,
        erc20Abi,
        signer
      );
      const approveTx = await tokenContract.approve(
        vaultAddress,
        depositAmountWei,
        { gasLimit: 100_000 }
      );
      await approveTx.wait();
      // 2) Call the ERC-4626 deposit function
      const tx = await vaultContract.deposit(
        depositAmountWei,
        userAddr,         // receiver
        { gasLimit: 250_000 }
      );
      // Manual polling for transaction receipt, with retry and backoff to avoid rate limits
      const rpcProvider = new JsonRpcProvider("https://mainnet.base.org");
      let receipt = null;
      for (let i = 0; i < 10; i++) {
        try {
          const tmp = await rpcProvider.getTransactionReceipt(tx.hash);
          if (tmp && tmp.blockNumber) {
            receipt = tmp;
            break;
          }
        } catch (pollError) {
          console.warn("Receipt poll error, retrying", pollError);
        }
        // Wait 6 seconds before next attempt
        await new Promise((res) => setTimeout(res, 6000));
      }
      if (receipt) {
        setTestResults((prev) => [...prev, "Deposit confirmed on chain"]);
      } else {
        setTestResults((prev) => [...prev, `Transaction submitted: ${tx.hash}`]);
      }
    } catch (error: unknown) {
      console.error("Error during deposit action:", error);
      setTestResults((prev) => [
        ...prev,
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      ]);
    }
  };

  const runWithdraw = async () => {
    setTestResults([]);

    if (!client.data || !client.data.account) {
      setTestResults(["Please connect your wallet first"]);
      return;
    }

    try {
      // 1) Get an ethers.js signer from the user’s wallet
      const provider = new BrowserProvider(window.ethereum as any);
      const signer   = await provider.getSigner();
      const userAddr = await signer.getAddress();

      // 2) Instantiate the vault contract with your ABI
      const vaultContract = new Contract(
        vaultAddress,
        vaultAbi,
        signer
      );

      // 3) Determine the number of shares to withdraw
      let sharesToWithdraw: bigint;
      if (isFullWithdraw) {
        if (!position) {
          throw new Error("Position data not available");
        }
        sharesToWithdraw = position.depositedAssets;
        // Update the input field to show the exact amount being withdrawn
        setInputs((prev) => ({
          ...prev,
          amountToWithdraw: formatUnits(position.depositedAssets, 18),
        }));
      } else {
        // Convert the user-entered underlying amount to shares via totalAssets/totalSupply ratio
        const amountToWithdraw = parseEther(inputs.amountToWithdraw);

        // Fetch total assets and total shares from the vault
        const [totalAssets, totalShares] = await Promise.all([
          vaultContract.totalAssets(),
          vaultContract.totalSupply()
        ]);

        // Compute shares proportionally: shares = amount * totalShares / totalAssets
        sharesToWithdraw = (amountToWithdraw * totalShares) / totalAssets;
      }

      // 4) Call the ERC-4626 withdraw function (shares, recipient, owner)
      const tx = await vaultContract.withdraw(
        sharesToWithdraw,
        userAddr,  // recipient of underlying
        userAddr,  // owner of shares
        { gasLimit: 250_000 }
      );
      await tx.wait();

      // 5) Log success
      setTestResults((prev) => [
        ...prev,
        "Withdraw executed on-chain successfully",
      ]);
    } catch (error: unknown) {
      console.error("Error during withdraw action:", error);
      setTestResults((prev) => [
        ...prev,
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      ]);
    }
  };

  return (
    <div className="space-y-6 mb-8">
      {/* Remove the grid-cols-3 to allow full width */}
      <div className="grid grid-cols-1 gap-8 mb-8">
        {/* Add a nested grid for the three cards */}
        <div className="grid grid-cols-3 gap-8">
          {/* Current Position Card */}
          <div className="bg-[#1E1E1E] rounded-lg p-6 border-[1.5px] border-gray-700">
            <h2 className="text-xl font-semibold mb-6 flex items-center">
              <span className="mr-2">▲</span> Current Position
            </h2>
            {!client.data?.account ? (
              <div className="text-gray-500 text-sm">
                Please connect your wallet
              </div>
            ) : chainId === 999 ? (
              posLoading ? (
                <div className="text-gray-500 text-sm">Loading position...</div>
              ) : posError ? (
                <div className="text-red-500 text-sm">{posError}</div>
              ) : onchainPosition ? (
                <div className="space-y-4">
                  <div className="bg-[#121212] border border-gray-700 rounded-md p-3">
                    <div className="space-y-4">
                      <div>
                        <div className="text-sm text-gray-400 mb-1">
                          Vault Token Balance
                        </div>
                        <div className="font-medium">
                          {formatUnits(onchainPosition.shares, 18)} Vault&nbsp;Shares
                        </div>
                      </div>
                      <div className="pt-4 border-t border-gray-700">
                        <div className="text-sm text-gray-400 mb-1">
                          Underlying Equivalent
                        </div>
                        <div className="font-medium">
                          {formatUnits(onchainPosition.assets, 18)} WHYPE
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-gray-500 text-sm">
                  No position data available
                </div>
              )
            ) : positionLoading ? (
              <div className="text-gray-500 text-sm">Loading position...</div>
            ) : positionError ? (
              <div className="text-red-500 text-sm">{positionError}</div>
            ) : position ? (
              <div className="space-y-4">
                <div className="bg-[#121212] border border-gray-700 rounded-md p-3">
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm text-gray-400 mb-1">
                        Vault Token Balance
                      </div>
                      <div className="font-medium">
                        {formatUnits(position.depositedAssets, 18)}{" "}
                        {position.vaultSymbol}
                      </div>
                    </div>
                    <div className="pt-4 border-t border-gray-700">
                      <div className="text-sm text-gray-400 mb-1">
                        Underlying Equivalent
                      </div>
                      <div className="font-medium">
                        {formatUnits(
                          (position.depositedAssets *
                            position.shareToUnderlying) /
                            BigInt(1e18),
                          18
                        )}{" "}
                        {position.underlyingSymbol}
                      </div>
                    </div>
                    <div className="pt-4 border-t border-gray-700">
                      <div className="text-sm text-gray-400 mb-1">Projected Earnings</div>
                      <div className="font-medium space-y-1">
                        <div>Monthly: ${monthlyEarningsUsd.toFixed(2)}</div>
                        <div>Annual:  ${annualEarningsUsd.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-gray-500 text-sm">
                No position data available
              </div>
            )}
          </div>

          {/* Deposit Card */}
          <div className="bg-[#1E1E1E] rounded-lg p-6 border-[1.5px] border-gray-700">
            <h2 className="text-xl font-semibold mb-6">Deposit</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-300">
                  Deposit Amount (native units)
                </label>
                <input
                  type="text"
                  name="amountToDeposit"
                  value={inputs.amountToDeposit}
                  onChange={handleInputChange}
                  className="w-full bg-[#121212] border-[0.5px] border-gray-300 rounded p-2.5 text-sm"
                />
              </div>

              <button
                onClick={runDeposit}
                className="w-full !bg-blue-500 hover:bg-[#0045CC] text-white py-3 rounded-md font-medium mt-6 transition-colors"
              >
                Deposit
              </button>

              <div className="text-sm text-gray-400 mt-2">
                {!client.data?.account ? (
                  "Connect wallet to see balance"
                ) : chainId === 999 ? (
                  balLoading ? (
                    "Loading balance..."
                  ) : balError ? (
                    <span className="text-red-400">{balError}</span>
                  ) : onchainBalance !== null ? (
                    <>Balance: {formatUnits(onchainBalance, 18)} WHYPE</>
                  ) : (
                    "No balance data"
                  )
                ) : tokenBalanceLoading ? (
                  "Loading balance..."
                ) : tokenBalanceError ? (
                  <span className="text-red-400">Error loading balance</span>
                ) : tokenBalance ? (
                  <>
                    Balance:{" "}
                    {formatUnits(tokenBalance.balance, tokenBalance.decimals)}{" "}
                    {tokenBalance.symbol} ({tokenBalance.address.slice(0, 6)}
                    ...{tokenBalance.address.slice(-4)})
                  </>
                ) : (
                  "No balance data"
                )}
              </div>
            </div>
          </div>

          {/* Withdraw Card */}
          <div className="bg-[#1E1E1E] rounded-lg p-6 border-[1.5px] border-gray-700">
            <h2 className="text-xl font-semibold mb-6">Withdraw</h2>
            <div className="space-y-4">
              <div className="flex items-center mb-4">
                <input
                  type="checkbox"
                  id="fullWithdraw"
                  checked={isFullWithdraw}
                  onChange={(e) => setIsFullWithdraw(e.target.checked)}
                  className="mr-2"
                />
                <label htmlFor="fullWithdraw" className="text-sm text-gray-300">
                  Full Withdraw
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-300">
                  Withdraw Amount (native units)
                </label>
                <input
                  type="text"
                  name="amountToWithdraw"
                  value={
                    isFullWithdraw && position
                      ? formatUnits(position.depositedAssets, 18)
                      : inputs.amountToWithdraw
                  }
                  onChange={handleInputChange}
                  disabled={isFullWithdraw}
                  className={`w-full bg-[#121212] border-[0.5px] border-gray-300 rounded p-2.5 text-sm ${
                    isFullWithdraw ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                />
              </div>

              <button
                onClick={runWithdraw}
                className="w-full !bg-red-500 hover:bg-red-600 text-white py-3 rounded-md font-medium mt-6 transition-colors"
              >
                {isFullWithdraw ? "Withdraw All" : "Withdraw"}
              </button>
            </div>
          </div>
        </div>

        {/* Test Results Section */}
        <div className="bg-[#1E1E1E] rounded-lg p-6 border-[1.5px] border-gray-700">
          <h2 className="text-xl font-semibold mb-4">Test Results</h2>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {testResults.length > 0 ? (
              testResults.map((result, index) => (
                <div
                  key={index}
                  className="bg-[#121212] border border-gray-700 rounded-md p-2 text-sm"
                >
                  {result}
                </div>
              ))
            ) : (
              <div className="text-gray-500 text-sm">
                No results to display yet.
              </div>
            )}
          </div>
        </div>

        {/* Transaction History Section */}
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">Transaction History</h2>
          <TransactionHistory vaultAddress={vaultAddress} />
        </div>
      </div>
    </div>
  );
}

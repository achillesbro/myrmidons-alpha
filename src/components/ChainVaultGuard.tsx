// src/components/ChainVaultGuard.tsx
import { type ReactNode } from "react";
import { useAccount, useChainId } from "wagmi";

type Props = {
  /** The only chain we allow for these children (e.g., 999 for HyperEVM) */
  requiredChainId: number;
  /** The vault the user is about to interact with */
  vaultAddress: `0x${string}`;
  /** Whitelist per chain (addresses must be checksum-cased) */
  allowedVaultsByChain: Record<number, readonly `0x${string}`[]>;
  /** If true, show children but add a warning banner. Default: false (block). */
  warnOnly?: boolean;
  children: ReactNode;
  /** Optional friendly chain name for the UI (e.g., "HyperEVM") */
  requiredChainName?: string;
};

export function ChainVaultGuard({
  requiredChainId,
  vaultAddress,
  allowedVaultsByChain,
  warnOnly = false,
  requiredChainName = "HyperEVM",
  children,
}: Props) {
  const { isConnected } = useAccount();
  const chainId = useChainId();

  const allowed = allowedVaultsByChain[requiredChainId] ?? [];
  const isVaultAllowed = allowed
    .map((a) => a.toLowerCase())
    .includes(vaultAddress.toLowerCase() as `0x${string}`);

  const wrongChain = isConnected && chainId !== requiredChainId;
  const badVault = isConnected && !wrongChain && !isVaultAllowed;

  // If not connected: just render children (your UI already asks to connect)
  if (!isConnected) return <>{children}</>;

  // Wrong vault
  if (badVault && !warnOnly) {
    return (
      <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-4 text-[#101720]">
        <div className="text-sm">
          This vault address is not in the allowlist for {requiredChainName}. Please verify the URL or contact support.
        </div>
      </div>
    );
  }

  if (badVault && warnOnly) {
    return (
      <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-4 text-[#101720]">
        <div className="text-sm mb-3">
          Warning: this vault address is not recognized for {requiredChainName}. Proceed with caution.
        </div>
        {children}
      </div>
    );
  }

  // All good
  return <>{children}</>;
}
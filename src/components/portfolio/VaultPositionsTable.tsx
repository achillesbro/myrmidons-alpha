import { formatUnits } from "viem";
import { formatUsd, formatPct } from "../../lib/portfolio-utils";
import { InfoTooltip } from "../metric-card";
import { ListedVault, MorphoVaultApy } from "../../lib/portfolio-data";

export interface VaultPosition {
  vault: ListedVault;
  shares: bigint;
  valueUsd: number;
  sharePriceUsd: number;
  apr7d: number;
  weight: number;
  pnlAbs: number | null;
  pnlPct: number | null;
  apyData?: MorphoVaultApy;
}

interface VaultPositionsTableProps {
  positions: VaultPosition[];
  onSort?: (column: string) => void;
  sortColumn?: string;
  sortDirection?: "asc" | "desc";
}

export function VaultPositionsTable({
  positions,
  onSort,
  sortColumn,
  sortDirection = "desc",
}: VaultPositionsTableProps) {
  const handleSort = (column: string) => {
    if (onSort) {
      onSort(column);
    }
  };

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) return null;
    return sortDirection === "asc" ? "↑" : "↓";
  };

  if (positions.length === 0) {
    return (
      <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-3">
        <p className="text-sm text-[#101720]/70 text-center py-4">
          No positions found
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-3">
      {/* Header - Hidden on mobile */}
      <div className="hidden sm:grid grid-cols-[2fr_2fr_2fr_1.5fr_1fr_1fr_1.3fr_0.7fr] text-sm font-semibold text-[#00295B] py-2 px-3 border-b-2 border-gray-300 gap-1">
        <div className="flex items-center">
          <button
            onClick={() => handleSort("vault")}
            className="table-header-sort text-sm hover:opacity-75 transition-opacity flex items-center gap-1"
            style={{ color: 'var(--heading, #00295B)' }}
          >
            Vault {getSortIcon("vault")}
          </button>
        </div>
        <div className="flex items-center justify-end">
          <button
            onClick={() => handleSort("balance")}
            className="table-header-sort text-sm hover:opacity-75 transition-opacity flex items-center gap-1"
            style={{ color: 'var(--heading, #00295B)' }}
          >
            Balance {getSortIcon("balance")}
          </button>
        </div>
        <div className="flex items-center justify-end">
          <button
            onClick={() => handleSort("value")}
            className="table-header-sort text-sm hover:opacity-75 transition-opacity flex items-center gap-1"
            style={{ color: 'var(--heading, #00295B)' }}
          >
            Value {getSortIcon("value")}
            <InfoTooltip label="shares × share price" />
          </button>
        </div>
        <div className="text-right whitespace-nowrap">Share Price</div>
        <div className="text-right whitespace-nowrap">7D APR</div>
        <div className="text-right whitespace-nowrap">Weight</div>
        <div className="text-right">
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            P&L
            <InfoTooltip label="Based on your cost basis when available." />
          </span>
        </div>
        <div className="text-right whitespace-nowrap">Actions</div>
      </div>

      {/* Rows */}
      <div className="space-y-1">
        {positions.map((position) => {
          const vaultUrl = `/?tab=vaultinfo&vault=${position.vault.id}`;
          const sharesNum = Number(formatUnits(position.shares, position.vault.shareDecimals));
          
          return (
            <div key={position.vault.id} className="border-b border-gray-200 last:border-0">
              {/* Mobile Layout */}
              <div className="sm:hidden space-y-1 py-1.5 px-2">
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-sm text-[#101720]">
                    {position.vault.name}
                  </span>
                  {position.vault.kind === "hypairdrop" && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] uppercase tracking-wider rounded bg-green-100 text-green-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-600"></span>
                      Live
                    </span>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-base font-semibold text-[#00295B]">
                    {formatPct(position.weight / 100, 1)}
                  </span>
                  <div className="text-right">
                    <div className="text-sm font-medium text-[#101720]">
                      {formatUsd(position.valueUsd)}
                    </div>
                    <div className="text-xs text-gray-600">
                      {sharesNum.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })} {position.vault.symbol}
                    </div>
                  </div>
                </div>
              </div>

              {/* Desktop Layout */}
              <div className="hidden sm:grid grid-cols-[2fr_2fr_2fr_1.5fr_1fr_1fr_1.3fr_0.7fr] items-center py-1.5 sm:py-2 px-2 sm:px-3 border-b border-gray-200 hover:bg-gray-50/30 transition-colors gap-1">
                <div className="flex items-center space-x-2 text-[#101720]">
                  <span className="font-medium text-sm truncate">
                    {position.vault.name}
                  </span>
                  {position.vault.kind === "hypairdrop" && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] uppercase tracking-wider rounded bg-green-100 text-green-800 flex-shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-600"></span>
                      Live
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-end">
                  <span className="text-sm font-medium text-[#101720] whitespace-nowrap">
                    {sharesNum.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })} {position.vault.symbol}
                  </span>
                </div>
                <div className="flex items-center justify-end">
                  <span className="text-sm font-semibold text-[#00295B] whitespace-nowrap">
                    {formatUsd(position.valueUsd)}
                  </span>
                </div>
                <div className="flex items-center justify-end">
                  <span className="text-sm font-medium text-[#101720] whitespace-nowrap">
                    {formatUsd(position.sharePriceUsd)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-medium text-[#101720] whitespace-nowrap">
                    {formatPct(position.apr7d)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold text-[#00295B] whitespace-nowrap">
                    {formatPct(position.weight / 100, 1)}
                  </span>
                </div>
                <div className="text-right">
                  {position.pnlAbs != null ? (
                    <span className={`text-sm font-medium whitespace-nowrap ${position.pnlAbs >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {formatUsd(position.pnlAbs)}
                      {position.pnlPct != null && (
                        <span className="text-xs ml-1">
                          ({formatPct(position.pnlPct)})
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400">—</span>
                  )}
                </div>
                <div className="flex items-center justify-end">
                  <div className="flex items-center gap-2">
                    <a
                      href={`${vaultUrl}#deposit`}
                      className="text-[10px] px-2 py-1 font-semibold rounded transition-all duration-200 whitespace-nowrap"
                      style={{ background: 'var(--muted-brass, #B08D57)', color: '#fff' }}
                    >
                      Deposit
                    </a>
                    <a
                      href={`${vaultUrl}#withdraw`}
                      className="text-[10px] px-2 py-1 border border-black/10 rounded hover:border-black/20 transition-colors whitespace-nowrap"
                      style={{ color: 'var(--text, #101720)' }}
                    >
                      Withdraw
                    </a>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


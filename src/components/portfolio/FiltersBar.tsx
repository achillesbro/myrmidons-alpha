import { Search } from "lucide-react";
import { useState, useEffect } from "react";

export type VaultTypeFilter = "all" | "morpho" | "hypairdrop";

interface FiltersBarProps {
  vaultType: VaultTypeFilter;
  onVaultTypeChange: (type: VaultTypeFilter) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function FiltersBar({
  vaultType,
  onVaultTypeChange,
  searchQuery,
  onSearchChange,
}: FiltersBarProps) {
  const [localSearch, setLocalSearch] = useState(searchQuery);

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearchChange(localSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch, onSearchChange]);

  return (
    <div className="flex flex-wrap items-center gap-4">
      {/* Vault Type Pills */}
      <div className="flex gap-2">
        {(["all", "morpho", "hypairdrop"] as const).map((type) => (
          <button
            key={type}
            onClick={() => onVaultTypeChange(type)}
            aria-pressed={vaultType === type}
            className={`px-4 py-2 text-xs uppercase tracking-wider rounded-lg border transition-colors ${
              vaultType === type
                ? 'bg-[var(--text,#101720)] text-[var(--bg,#FFFFF5)] border-[var(--text,#101720)]'
                : 'bg-white border-black/10 text-[var(--text,#101720)] hover:border-black/20'
            }`}
          >
            {type === "all" ? "All" : type === "morpho" ? "Morpho" : "HypAirdrop"}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text, #101720)', opacity: 0.4 }} />
        <input
          type="text"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search vaults..."
          className="w-full pl-10 pr-4 py-2 text-sm border border-black/10 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black/20"
          style={{ color: 'var(--text, #101720)' }}
        />
      </div>
    </div>
  );
}


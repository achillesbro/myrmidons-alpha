import { formatUsd, formatPct } from "../../lib/portfolio-utils";
import { VaultPosition } from "./VaultPositionsTable";

interface AllocationPanelProps {
  positions: VaultPosition[];
}

export function AllocationPanel({ positions }: AllocationPanelProps) {
  if (positions.length === 0) {
    return (
      <div className="rounded-2xl shadow-sm bg-white border border-black/5 p-6">
        <h3 className="text-[11px] uppercase tracking-wider font-semibold mb-4" style={{ color: 'var(--text, #101720)', opacity: 0.6 }}>
          Allocation
        </h3>
        <p className="text-sm" style={{ color: 'var(--text, #101720)', opacity: 0.7 }}>
          No positions
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl shadow-sm bg-white border border-black/5 p-6">
      <h3 className="text-[11px] uppercase tracking-wider font-semibold mb-4" style={{ color: 'var(--text, #101720)', opacity: 0.6 }}>
        Allocation
      </h3>
      <div className="space-y-2">
        {positions
          .sort((a, b) => b.valueUsd - a.valueUsd)
          .map((position) => (
            <div key={position.vault.id} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2 flex-1">
                <span className="text-sm font-medium" style={{ color: 'var(--text, #101720)' }}>
                  {position.vault.name}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-black/5" style={{ color: 'var(--text, #101720)', opacity: 0.7 }}>
                  {formatUsd(position.valueUsd)}
                </span>
              </div>
              <span className="text-sm font-semibold" style={{ color: 'var(--heading, #00295B)' }}>
                {formatPct(position.weight / 100, 1)}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}


import { formatUnits } from "viem";

export function AllocationList({
  items,
  totalAssets,
  decimals = 18,
}: {
  items: Array<{ id: `0x${string}`; label: string; assets: bigint; pct: number }>;
  totalAssets: bigint;
  decimals?: number;
}) {
  const sum = items.reduce((acc, it) => acc + it.assets, 0n);
  const idle = totalAssets - sum;
  const clampPct = (n: number) => Math.max(0, Math.min(100, n));

  return (
    <div className="space-y-3">
      {items.map((it) => (
        <div key={it.id} className="bg-[#121212] border border-gray-700 rounded-md p-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">{it.label}</div>
            <div className="text-sm text-gray-300">
              {formatUnits(it.assets, decimals)} &nbsp;({it.pct.toFixed(2)}%)
            </div>
          </div>
          <div className="mt-2 h-1.5 bg-gray-800 rounded">
            <div
              className="h-1.5 bg-blue-500 rounded"
              style={{ width: `${clampPct(it.pct)}%` }}
            />
          </div>
        </div>
      ))}
      {idle > 0n && (
        <div className="bg-[#121212] border border-gray-700 rounded-md p-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">Idle</div>
            <div className="text-sm text-gray-300">{formatUnits(idle, decimals)}</div>
          </div>
          <div className="mt-2 h-1.5 bg-gray-800 rounded">
            <div
              className="h-1.5 bg-gray-600 rounded"
              style={{
                width: `${
                  Number(idle) === 0
                    ? 0
                    : Math.min(
                        100,
                        Number((idle * 10000n) / (totalAssets === 0n ? 1n : totalAssets)) / 100
                      )
                }%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
// src/components/grouped-allocation-list.tsx
import { useState, useMemo } from 'react';
import { type GroupedAllocation, type AllocationItem } from '../lib/allocation-grouper';


interface GroupedAllocationListProps {
  groupedItems: GroupedAllocation[];
  ungroupedItems: AllocationItem[];
  totalAssets: bigint;
  isHypAirdrop?: boolean; // If true, use HypAirdrop-specific columns (Exposure, Amount, no APY)
}

function ceilPct(pct: number): string {
  return pct < 0.01 ? "<0.01" : pct.toFixed(2);
}

function AllocationRow({ 
  item, 
  isSubItem = false, 
  isHypAirdrop = false
}: { 
  item: AllocationItem; 
  isSubItem?: boolean; 
  isHypAirdrop?: boolean;
}) {
  // Use the pre-calculated percentage from the item (based on USD value)
  // This is more accurate than calculating from raw asset balance
  const pct = item.pct || 0;
  
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-12 items-center py-1.5 sm:py-2 px-2 sm:px-3 ${
      isSubItem ? 'ml-4 border-b border-gray-100' : 'border-b border-gray-200'
    }`}>
      {/* Mobile Layout */}
      <div className="sm:hidden space-y-1">
        <div className="flex items-center space-x-2">
          {item.logo ? (
            <img
              src={item.logo}
              alt={item.label}
              className="w-4 h-4 rounded-full border border-[#E5E2D6] object-contain flex-shrink-0"
              onError={(e) => {
                console.warn(`[AllocationRow] Failed to load logo for ${item.label}:`, item.logo);
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : isHypAirdrop && (
            // Show placeholder for HypAirdrop tokens without logo
            <div className="w-4 h-4 rounded-full border border-[#E5E2D6] bg-gray-200 flex-shrink-0"></div>
          )}
          <span className="font-medium truncate text-sm">{isHypAirdrop ? item.label.toUpperCase() : item.label}</span>
          {isSubItem && !isHypAirdrop && <span className="text-sm text-gray-500">(individual market)</span>}
        </div>
        <div className="flex justify-between">
          <span className="text-base font-semibold text-[#00295B]">
            {ceilPct(pct)}%
          </span>
          <div className="text-right">
            {item.usd != null && (
              <div className="text-sm font-medium text-[#101720]">
                ${item.usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            )}
            {!isHypAirdrop && item.supplyApy != null && (
              <div className="text-xs text-gray-600">
                {(item.supplyApy * 100).toFixed(2)}% APY
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden sm:contents">
        <div className="col-span-5 flex items-center space-x-2 text-[#101720]">
          {item.logo ? (
            <img
              src={item.logo}
              alt={item.label}
              className="w-4 h-4 rounded-full border border-[#E5E2D6] object-contain flex-shrink-0"
              onError={(e) => {
                console.warn(`[AllocationRow] Failed to load logo for ${item.label}:`, item.logo);
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : isHypAirdrop && (
            // Show placeholder for HypAirdrop tokens without logo
            <div className="w-4 h-4 rounded-full border border-[#E5E2D6] bg-gray-200 flex-shrink-0"></div>
          )}
          <span className="font-medium truncate text-sm">{isHypAirdrop ? item.label.toUpperCase() : item.label}</span>
          {isSubItem && !isHypAirdrop && <span className="text-xs text-gray-500">(individual market)</span>}
        </div>
        <div className="col-span-3 text-right">
          <span className="text-sm font-semibold text-[#00295B]">
            {ceilPct(pct)}%
          </span>
        </div>
        {isHypAirdrop ? (
          <div className="col-span-4 text-right">
            <span className="text-sm font-medium text-[#101720]">
              {item.usd != null
                ? `$${item.usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                : "N/A"}
            </span>
          </div>
        ) : (
          <>
            <div className="col-span-2 text-right">
              <span className="text-sm font-medium text-[#101720]">
                {item.usd != null
                  ? `$${item.usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                  : "N/A"}
              </span>
            </div>
            <div className="col-span-2 text-right">
              {item.supplyApy != null ? (
                <span className="text-sm font-medium text-[#101720]">
                  {(item.supplyApy * 100).toFixed(2)}%
                </span>
              ) : (
                <span className="text-sm text-gray-400">—</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function GroupedAllocationRow({ 
  group, 
  totalAssets, 
  onToggle,
  isHypAirdrop = false
}: { 
  group: GroupedAllocation; 
  totalAssets: bigint; 
  onToggle: (familyLabel: string) => void;
  isHypAirdrop?: boolean;
}) {
  // For HypAirdrop, use USD-based percentage from group.percentage (already calculated)
  // For Morpho, calculate from asset balance (for compatibility)
  const pct = isHypAirdrop 
    ? (group.percentage || 0) 
    : (totalAssets > 0n ? Number((group.totalAssets * 10000n) / totalAssets) / 100 : 0);
  
  return (
    <div className="space-y-1">
      {/* Family Header */}
      <div 
        className="grid grid-cols-1 sm:grid-cols-12 items-center py-2 sm:py-2.5 px-2 sm:px-3 cursor-pointer hover:bg-gray-50/30 transition-colors border-b border-gray-200"
        onClick={() => onToggle(group.familyLabel)}
      >
        {/* Mobile Layout */}
        <div className="sm:hidden space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {group.familyLogo && (
                <img
                  src={group.familyLogo}
                  alt={group.familyLabel}
                  className="w-5 h-5 rounded-full border border-[#E5E2D6] object-contain flex-shrink-0"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
              )}
              <span className="font-semibold text-base">{group.familyLabel}</span>
            </div>
            <span className="text-lg">{group.isExpanded ? '▲' : '▼'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-base font-semibold text-[#00295B]">
              {ceilPct(pct)}%
            </span>
            <div className="text-right">
              {group.totalUsd != null && (
                <div className="text-sm font-medium text-[#101720]">
                  ${group.totalUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              )}
              {!isHypAirdrop && (
                <div className="text-sm text-gray-600">
                  {(group.weightedApy * 100).toFixed(2)}% APY (avg)
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Desktop Layout */}
        <div className="hidden sm:contents">
          <div className="col-span-5 flex items-center space-x-2 text-[#101720]">
            {group.familyLogo && (
              <img
                src={group.familyLogo}
                alt={group.familyLabel}
                className="w-4 h-4 rounded-full border border-[#E5E2D6] object-contain flex-shrink-0"
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
            )}
            <span className="font-semibold text-sm">{group.familyLabel}</span>
          </div>
          <div className="col-span-3 text-right">
            <span className="text-sm font-semibold text-[#00295B]">
              {ceilPct(pct)}%
            </span>
          </div>
          {isHypAirdrop ? (
            <div className="col-span-4 text-right flex items-center justify-end space-x-2">
              <span className="text-sm font-medium text-[#101720]">
                {group.totalUsd != null
                  ? `$${group.totalUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                  : "N/A"}
              </span>
              <span className="text-sm">{group.isExpanded ? '▲' : '▼'}</span>
            </div>
          ) : (
            <>
              <div className="col-span-2 text-right">
                <span className="text-sm font-medium text-[#101720]">
                  {group.totalUsd != null
                    ? `$${group.totalUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    : "N/A"}
                </span>
              </div>
            <div className="col-span-2 text-right flex items-center justify-end space-x-2">
              <span className="text-sm font-medium text-[#101720]">
                {(group.weightedApy * 100).toFixed(2)}%
              </span>
              <span className="text-sm">{group.isExpanded ? '▲' : '▼'}</span>
            </div>
            </>
          )}
        </div>
      </div>

      {/* Individual Markets (when expanded) - No description */}
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${
        group.isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
      }`}>
        <div className="pt-0.5">
          {/* Individual Markets */}
          {group.markets.map((market) => (
            <AllocationRow
              key={market.id}
              item={market}
              isSubItem={true}
              isHypAirdrop={isHypAirdrop}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function GroupedAllocationList({
  groupedItems,
  ungroupedItems,
  totalAssets,
  isHypAirdrop = false,
}: GroupedAllocationListProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const handleToggleGroup = (familyLabel: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(familyLabel)) {
        newSet.delete(familyLabel);
      } else {
        newSet.add(familyLabel);
      }
      return newSet;
    });
  };

  // Apply expansion state to groups
  const groupsWithExpansion = useMemo(() => {
    return groupedItems.map(group => ({
      ...group,
      isExpanded: expandedGroups.has(group.familyLabel)
    }));
  }, [groupedItems, expandedGroups]);

  if (groupedItems.length === 0 && ungroupedItems.length === 0) {
    return <p className="text-sm text-[#101720]/70">No allocations found</p>;
  }

  return (
    <div className="space-y-1">
      {/* Enhanced Header - Hidden on mobile */}
      <div className="hidden sm:grid grid-cols-12 text-sm font-semibold text-[#00295B] py-2 px-3 border-b-2 border-gray-300">
        <div className="col-span-5">{isHypAirdrop ? 'Exposure' : 'Market'}</div>
        <div className="col-span-3 text-right">Share</div>
        {isHypAirdrop ? (
          <div className="col-span-4 text-right">USD Value</div>
        ) : (
          <>
            <div className="col-span-2 text-right">USD Value</div>
            <div className="col-span-2 text-right">APY</div>
          </>
        )}
      </div>

      {/* Grouped Items */}
      {groupsWithExpansion.map((group) => (
        <GroupedAllocationRow
          key={group.familyLabel}
          group={group}
          totalAssets={totalAssets}
          onToggle={handleToggleGroup}
          isHypAirdrop={isHypAirdrop}
        />
      ))}

      {/* Ungrouped Items */}
      {ungroupedItems.map((item) => (
        <AllocationRow
          key={item.id}
          item={item}
          isHypAirdrop={isHypAirdrop}
        />
      ))}

    </div>
  );
}

// src/components/grouped-allocation-list.tsx
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { type GroupedAllocation, type ProtocolGroupedAllocation, type AllocationItem } from '../lib/allocation-grouper';


interface GroupedAllocationListProps {
  groupedItems: GroupedAllocation[] | ProtocolGroupedAllocation[];
  ungroupedItems: AllocationItem[];
  totalAssets: bigint;
  isProtocolGrouping?: boolean; // If true, treat groupedItems as ProtocolGroupedAllocation[]
}

function ceilPct(pct: number): string {
  return pct < 0.01 ? "<0.01" : pct.toFixed(2);
}

function AllocationRow({ 
  item, 
  isSubItem = false, 
  totalAssets 
}: { 
  item: AllocationItem; 
  isSubItem?: boolean; 
  totalAssets: bigint;
}) {
  const pct = totalAssets > 0n ? Number((item.assets * 10000n) / totalAssets) / 100 : 0;
  
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-12 items-center py-3 sm:py-4 px-3 sm:px-4 ${
      isSubItem ? 'ml-6 border-b border-gray-100' : 'border-b border-gray-200'
    }`}>
      {/* Mobile Layout */}
      <div className="sm:hidden space-y-1">
        <div className="flex items-center space-x-2">
          {item.logo && (
            <img
              src={item.logo}
              alt={item.label}
              className="w-5 h-5 rounded-full border border-[#E5E2D6] object-contain flex-shrink-0"
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
          )}
          <span className="font-medium truncate text-base">{item.label}</span>
          {isSubItem && <span className="text-sm text-gray-500">(individual market)</span>}
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
            {item.supplyApy != null && (
              <div className="text-sm text-gray-600">
                {(item.supplyApy * 100).toFixed(2)}% APY
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden sm:contents">
        <div className="col-span-5 flex items-center space-x-2 text-[#101720]">
          {item.logo && (
            <img
              src={item.logo}
              alt={item.label}
              className="w-5 h-5 rounded-full border border-[#E5E2D6] object-contain flex-shrink-0"
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
          )}
          <span className="font-medium truncate text-base">{item.label}</span>
          {isSubItem && <span className="text-sm text-gray-500">(individual market)</span>}
        </div>
        <div className="col-span-3 text-right">
          <span className="text-base font-semibold text-[#00295B]">
            {ceilPct(pct)}%
          </span>
        </div>
        <div className="col-span-2 text-right">
          <span className="text-sm font-medium text-[#101720]">
            {item.usd != null
              ? `$${item.usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              : "N/A"}
          </span>
        </div>
        <div className="col-span-2 text-right">
          <span className="text-sm font-medium text-[#101720]">
            {item.supplyApy != null
              ? `${(item.supplyApy * 100).toFixed(2)}%`
              : "N/A"}
          </span>
        </div>
      </div>
    </div>
  );
}

function GroupedAllocationRow({ 
  group, 
  totalAssets, 
  onToggle,
  isProtocolGrouping = false
}: { 
  group: GroupedAllocation | ProtocolGroupedAllocation; 
  totalAssets: bigint; 
  onToggle: (label: string) => void;
  isProtocolGrouping?: boolean;
}) {
  const pct = totalAssets > 0n ? Number((group.totalAssets * 10000n) / totalAssets) / 100 : 0;
  
  // Determine label and logo based on grouping type
  const label = isProtocolGrouping && 'protocolName' in group 
    ? group.protocolName 
    : 'familyLabel' in group 
      ? group.familyLabel 
      : '';
  const logo = isProtocolGrouping && 'protocolLogo' in group
    ? group.protocolLogo
    : 'familyLogo' in group
      ? group.familyLogo
      : null;
  const description = isProtocolGrouping 
    ? null // No description for protocol grouping
    : 'description' in group 
      ? group.description 
      : '';
  
  return (
    <div className="space-y-1">
      {/* Header */}
      <div 
        className="grid grid-cols-1 sm:grid-cols-12 items-center py-4 sm:py-5 px-3 sm:px-4 cursor-pointer hover:bg-gray-50/30 transition-colors border-b border-gray-200"
        onClick={() => onToggle(label)}
      >
        {/* Mobile Layout */}
        <div className="sm:hidden space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {logo && (
                <img
                  src={logo}
                  alt={label}
                  className="w-5 h-5 rounded-full border border-[#E5E2D6] object-contain flex-shrink-0"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
              )}
              <span className="font-semibold text-base">{label}</span>
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
              {group.weightedApy > 0 && (
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
            {logo && (
              <img
                src={logo}
                alt={label}
                className="w-5 h-5 rounded-full border border-[#E5E2D6] object-contain flex-shrink-0"
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
            )}
            <span className="font-semibold text-base">{label}</span>
          </div>
          <div className="col-span-3 text-right">
            <span className="text-base font-semibold text-[#00295B]">
              {ceilPct(pct)}%
            </span>
          </div>
          <div className="col-span-2 text-right">
            <span className="text-sm font-medium text-[#101720]">
              {group.totalUsd != null
                ? `$${group.totalUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                : "N/A"}
            </span>
          </div>
          <div className="col-span-2 text-right flex items-center justify-end space-x-2">
            {group.weightedApy > 0 && (
              <span className="text-sm font-medium text-[#101720]">
                {(group.weightedApy * 100).toFixed(2)}%
              </span>
            )}
            <span className="text-lg">{group.isExpanded ? '▲' : '▼'}</span>
          </div>
        </div>
      </div>

      {/* Description and Individual Markets (when expanded) */}
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${
        group.isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
      }`}>
        <div className="space-y-1 pt-2">
          {/* Description (only for token family grouping) */}
          {description && (
            <div className="ml-6 px-3 py-2 bg-gray-50/50 rounded-lg border-l-2 border-gray-200">
              <p className="text-base text-gray-600 leading-relaxed">
                {description}
              </p>
            </div>
          )}
          
          {/* Individual Markets */}
          {group.markets.map((market) => (
            <AllocationRow
              key={market.id}
              item={market}
              isSubItem={true}
              totalAssets={totalAssets}
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
  isProtocolGrouping = false,
}: GroupedAllocationListProps) {
  const { t } = useTranslation();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const handleToggleGroup = (label: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(label)) {
        newSet.delete(label);
      } else {
        newSet.add(label);
      }
      return newSet;
    });
  };

  // Apply expansion state to groups
  const groupsWithExpansion = useMemo(() => {
    return groupedItems.map(group => {
      const label = isProtocolGrouping && 'protocolName' in group
        ? group.protocolName
        : 'familyLabel' in group
          ? group.familyLabel
          : '';
      return {
        ...group,
        isExpanded: expandedGroups.has(label)
      };
    });
  }, [groupedItems, expandedGroups, isProtocolGrouping]);

  if (groupedItems.length === 0 && ungroupedItems.length === 0) {
    return <p className="text-sm text-[#101720]/70">No allocations found</p>;
  }

  return (
    <div className="space-y-1">
      {/* Enhanced Header - Hidden on mobile */}
      <div className="hidden sm:grid grid-cols-12 text-base font-semibold text-[#00295B] py-3 px-4 border-b-2 border-gray-300">
        <div className="col-span-5">Market</div>
        <div className="col-span-3 text-right">Share</div>
        <div className="col-span-2 text-right">USD Value</div>
        <div className="col-span-2 text-right">APY</div>
      </div>

      {/* Grouped Items */}
      {groupsWithExpansion.map((group) => {
        const label = isProtocolGrouping && 'protocolName' in group
          ? group.protocolName
          : 'familyLabel' in group
            ? group.familyLabel
            : '';
        return (
          <GroupedAllocationRow
            key={label}
            group={isProtocolGrouping 
              ? group 
              : {
                  ...group,
                  description: 'descriptionKey' in group ? t(group.descriptionKey) : ''
                }
            }
            totalAssets={totalAssets}
            onToggle={handleToggleGroup}
            isProtocolGrouping={isProtocolGrouping}
          />
        );
      })}

      {/* Ungrouped Items */}
      {ungroupedItems.map((item) => (
        <AllocationRow
          key={item.id}
          item={item}
          totalAssets={totalAssets}
        />
      ))}

    </div>
  );
}

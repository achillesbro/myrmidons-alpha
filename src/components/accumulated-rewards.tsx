import { useAccumulatedRewards } from '../hooks/useAccumulatedRewards';
import type { AllocationItem } from '../lib/allocation-grouper';

interface AccumulatedRewardsProps {
  walletAddress?: string;
  vaultAddress: string;
  allocations: AllocationItem[];
  loading?: boolean;
}

export function AccumulatedRewards({
  walletAddress,
  vaultAddress,
  allocations,
  loading: allocationsLoading = false,
}: AccumulatedRewardsProps) {
  const { rewards, loading: pointsLoading, error } = useAccumulatedRewards(
    walletAddress,
    vaultAddress,
    allocations
  );

  const isLoading = pointsLoading || allocationsLoading;

  // Show empty state if no wallet connected
  if (!walletAddress) {
    return (
      <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-3">
        <h3 className="text-sm font-semibold text-[#00295B] mb-2">
          Accumulated Rewards
        </h3>
        <p className="text-xs mb-3" style={{ color: 'var(--text, #101720)', opacity: 0.7 }}>
          Ecosystem points are distributed every week.
        </p>
        <p className="text-xs text-center py-4" style={{ color: 'var(--text, #101720)', opacity: 0.6 }}>
          Connect your wallet to view accumulated rewards
        </p>
      </div>
    );
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-3">
        <h3 className="text-sm font-semibold text-[#00295B] mb-2">
          Accumulated Rewards
        </h3>
        <p className="text-xs mb-3" style={{ color: 'var(--text, #101720)', opacity: 0.7 }}>
          Ecosystem points are distributed every week.
        </p>
        <div className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-5 h-5 rounded-full bg-[#E1E1D6] animate-pulse"></div>
                <div className="h-4 w-24 bg-[#E1E1D6] rounded animate-pulse"></div>
              </div>
              <div className="h-4 w-16 bg-[#E1E1D6] rounded animate-pulse"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-3">
        <h3 className="text-sm font-semibold text-[#00295B] mb-2">
          Accumulated Rewards
        </h3>
        <p className="text-xs mb-3" style={{ color: 'var(--text, #101720)', opacity: 0.7 }}>
          Ecosystem points are distributed every week.
        </p>
        <p className="text-xs text-center py-4" style={{ color: 'var(--text, #101720)', opacity: 0.6 }}>
          Unable to load rewards data
        </p>
      </div>
    );
  }

  // Show empty state if no rewards
  if (rewards.length === 0) {
    return (
      <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-3">
        <h3 className="text-sm font-semibold text-[#00295B] mb-2">
          Accumulated Rewards
        </h3>
        <p className="text-xs mb-3" style={{ color: 'var(--text, #101720)', opacity: 0.7 }}>
          Ecosystem points are distributed every week.
        </p>
        <p className="text-xs text-center py-4" style={{ color: 'var(--text, #101720)', opacity: 0.6 }}>
          No rewards data available
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-3">
      <h3 className="text-sm font-semibold text-[#00295B] mb-2">
        Accumulated Rewards
      </h3>
      <p className="text-xs mb-3" style={{ color: 'var(--text, #101720)', opacity: 0.7 }}>
        Ecosystem points are distributed every week.
      </p>
      <div className="space-y-2.5">
        {rewards.map((reward, index) => (
          <div key={`${reward.protocolKey}-${index}`} className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {reward.icon ? (
                <img
                  src={reward.icon}
                  alt={reward.name}
                  className="w-5 h-5 rounded-full flex-shrink-0"
                />
              ) : (
                <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(229, 226, 214, 0.3)' }}>
                  <span className="text-xs font-semibold" style={{ color: 'var(--text, #101720)', opacity: 0.6 }}>
                    {reward.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <span className="text-sm font-medium" style={{ color: 'var(--text, #101720)' }}>
                {reward.name}
              </span>
              {reward.tag && (
                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-black text-white">
                  {reward.tag}
                </span>
              )}
            </div>
            {reward.value !== null && (
              <span className="text-sm font-semibold" style={{ color: 'var(--heading, #00295B)' }}>
                {reward.value}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}


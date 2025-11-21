interface AccumulatedRewardsProps {
  walletAddress?: string;
  vaultAddress: string;
  allocations: unknown[];
  loading?: boolean;
}

export function AccumulatedRewards(_props: AccumulatedRewardsProps) {
  // Show "Coming soon" message
  return (
    <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-3">
      <h3 className="text-sm font-semibold text-[#00295B] mb-2">
        Rewards & Airdrops
      </h3>
      <p className="text-xs mb-3" style={{ color: 'var(--text, #101720)', opacity: 0.7 }}>
        Ecosystem rewards are distributed when available. Airdrops are never guaranteed.
      </p>
      <p className="text-xs text-center py-4" style={{ color: 'var(--text, #101720)', opacity: 0.6 }}>
        Coming soon
      </p>
    </div>
  );
}


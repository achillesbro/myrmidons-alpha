import React from 'react';

export interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  tooltip?: string;
  footnote?: React.ReactNode;
  loading?: boolean;
}

export default function MetricCard({
  label,
  value,
  tooltip,
  footnote,
  loading = false,
}: MetricCardProps) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1 mb-1">
        <p className="text-sm font-medium" style={{ color: 'var(--text, #101720)', opacity: 0.7 }}>
          {label}
        </p>
        {tooltip && (
          <button
            type="button"
            className="inline-flex items-center justify-center w-4 h-4 rounded-full text-xs hover:opacity-70 transition-opacity"
            style={{ background: 'rgba(0,41,91,0.1)', color: 'var(--heading, #00295B)' }}
            title={tooltip}
            aria-label={tooltip}
          >
            i
          </button>
        )}
      </div>
      
      {loading ? (
        <div className="h-7 bg-[#E1E1D6] rounded animate-pulse mx-auto" style={{ width: '80px' }}></div>
      ) : (
        <div className="text-xl font-bold mb-1" style={{ color: 'var(--heading, #00295B)' }}>
          {value}
        </div>
      )}
      
      {footnote && (
        <p className="text-xs mt-1" style={{ color: 'var(--text, #101720)', opacity: 0.6 }}>
          {footnote}
        </p>
      )}
    </div>
  );
}


import { useState } from 'react';

export interface CopyableAddressProps {
  address: string;
  explorerUrl: string;
  label?: string;
  loading?: boolean;
}

export default function CopyableAddress({
  address,
  explorerUrl,
  label = 'Vault Address',
  loading = false,
}: CopyableAddressProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  };

  const truncated = `${address.slice(0, 6)}…${address.slice(-4)}`;

  if (loading) {
    return (
      <div className="flex flex-col items-end gap-2">
        <div className="h-3 bg-[#E1E1D6] rounded w-16 animate-pulse"></div>
        <div className="flex items-center gap-2">
          <div className="h-7 bg-[#E1E1D6] rounded w-20 animate-pulse"></div>
          <div className="w-8 h-8 bg-[#E1E1D6] rounded animate-pulse"></div>
          <div className="w-8 h-8 bg-[#E1E1D6] rounded animate-pulse"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="text-xs" style={{ color: 'var(--text, #101720)', opacity: 0.7 }}>
        {label}
      </div>
      <div className="flex items-center gap-2">
        <code
          className="text-sm font-mono px-2 py-1 rounded"
          style={{ background: 'rgba(0,41,91,0.06)', color: 'var(--heading, #00295B)' }}
        >
          {truncated}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="w-8 h-8 flex items-center justify-center text-xs rounded transition-all duration-200 hover:opacity-80"
          style={{ background: 'rgba(0,41,91,0.1)', color: 'var(--heading, #00295B)' }}
          aria-label="Copy address"
        >
          {copied ? '✓' : '📋'}
        </button>
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-8 h-8 flex items-center justify-center text-xs rounded transition-all duration-200 hover:opacity-80"
          style={{ background: 'rgba(0,41,91,0.1)', color: 'var(--heading, #00295B)' }}
          aria-label="View on explorer"
        >
          🔗
        </a>
      </div>
    </div>
  );
}


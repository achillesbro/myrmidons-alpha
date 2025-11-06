import React from 'react';

type Props = { className?: string };
export const Skeleton: React.FC<Props> = ({ className }) => (
  <div
    className={className}
    style={{
      background: 'var(--skeleton, #E1E1D6)',
      borderRadius: 8,
      height: '1em',
      animation: 'pulse 1.5s ease-in-out infinite',
    }}
  />
);

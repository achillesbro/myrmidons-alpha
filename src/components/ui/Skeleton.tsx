import React from 'react';

type Props = { className?: string };
export const Skeleton: React.FC<Props> = ({ className }) => (
  <div
    className={className}
    style={{
      background: 'rgba(0,0,0,0.08)',
      borderRadius: 8,
      height: '1em',
      animation: 'pulse 1.5s ease-in-out infinite',
    }}
  />
);

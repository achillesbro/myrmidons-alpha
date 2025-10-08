import React from 'react';

export interface InnerPageHeroProps {
  title: string;
  subtitle?: string;
  badges?: Array<{ label: string; href?: string }>;
  showEngraving?: boolean;
  rightSlot?: React.ReactNode;
}

export default function InnerPageHero({
  title,
  subtitle,
  badges = [],
  showEngraving = true,
  rightSlot,
}: InnerPageHeroProps) {
  return (
    <section className="relative w-full py-10 md:py-12" style={{ background: 'var(--bg, #FFFFF5)' }}>
      {/* Background image with low opacity - only if enabled */}
      {showEngraving && (
        <>
          <div
            className="absolute w-screen bg-cover bg-center bg-no-repeat z-0"
            style={{
              backgroundImage: 'url(/trojan-war-heroes-greek-army.png)',
              opacity: 0.05,
              left: '50%',
              transform: 'translateX(-50%)',
              top: '-64px', // Start from header height (64px)
              bottom: 0,
              height: 'calc(100% + 64px)', // Extend upward to cover header gap
            }}
          />
          {/* Subtle readability overlay */}
          <div
            className="absolute w-screen pointer-events-none z-10"
            style={{
              background: 'linear-gradient(180deg, rgba(16,23,32,0.15) 0%, rgba(16,23,32,0.00) 60%)',
              left: '50%',
              transform: 'translateX(-50%)',
              top: '-64px', // Start from header height (64px)
              bottom: 0,
              height: 'calc(100% + 64px)', // Extend upward to cover header gap
            }}
          />
        </>
      )}

      <div className="relative max-w-6xl mx-auto px-4 z-20">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex-1">
            <h1
              className="text-2xl md:text-4xl font-semibold leading-tight"
              style={{ color: 'var(--heading, #00295B)' }}
            >
              {title}
            </h1>

            {subtitle && (
              <p
                className="mt-3 text-base md:text-lg max-w-[60ch]"
                style={{ color: 'var(--text, #101720)' }}
              >
                {subtitle}
              </p>
            )}

            {/* Badge row */}
            {badges.length > 0 && (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {badges.map((badge, index) => (
                  badge.href ? (
                    <a
                      key={index}
                      href={badge.href}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium hover:opacity-80 transition-opacity"
                      style={{ background: 'rgba(0,41,91,0.08)', color: 'var(--heading, #00295B)' }}
                    >
                      <span aria-hidden="true">◇</span>
                      {badge.label}
                    </a>
                  ) : (
                    <span
                      key={index}
                      className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium"
                      style={{ background: 'rgba(0,41,91,0.08)', color: 'var(--heading, #00295B)' }}
                    >
                      <span aria-hidden="true">◇</span>
                      {badge.label}
                    </span>
                  )
                ))}
              </div>
            )}
          </div>

          {/* Right slot for optional content like copyable address */}
          {rightSlot && (
            <div className="flex-shrink-0">
              {rightSlot}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}


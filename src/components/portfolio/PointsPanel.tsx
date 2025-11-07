import { HypAirdropPoints } from "../../lib/portfolio-data";

interface PointsPanelProps {
  points: HypAirdropPoints;
}

export function PointsPanel({ points }: PointsPanelProps) {
  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: "UTC",
        hour12: false,
      }) + " UTC";
    } catch {
      return "—";
    }
  };

  return (
    <div className="rounded-2xl shadow-sm bg-white border border-black/5 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text, #101720)', opacity: 0.6 }}>
          Points by Protocol
        </h3>
        {points.updatedAt && (
          <span className="text-[11px]" style={{ color: 'var(--text, #101720)', opacity: 0.5 }}>
            Updated at {formatTime(points.updatedAt)}
          </span>
        )}
      </div>

      {points.perProtocol.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text, #101720)', opacity: 0.7 }}>
          No points data available
        </p>
      ) : (
        <div className="space-y-3">
          {points.perProtocol.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between py-2 border-b border-black/5 last:border-0">
              <span className="text-sm font-medium" style={{ color: 'var(--text, #101720)' }}>
                {item.protocol}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold" style={{ color: 'var(--heading, #00295B)' }}>
                  {item.points.toLocaleString()}
                </span>
                {item.perDay != null && (
                  <span className="text-xs" style={{ color: 'var(--text, #101720)', opacity: 0.6 }}>
                    ~{item.perDay.toLocaleString()}/day
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-black/5">
        <p className="text-[10px]" style={{ color: 'var(--text, #101720)', opacity: 0.6 }}>
          Airdrops/points depend on external programs and are not guaranteed.
        </p>
      </div>
    </div>
  );
}


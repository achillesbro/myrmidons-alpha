import { ReactNode } from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

interface MetricCardProps {
  num: string;
  sub: ReactNode;
  delta?: string;
  deltaType?: "positive" | "negative" | "neutral";
  sparkline?: Array<{ value: number }>;
  tooltip?: string;
}

export function MetricCard({ num, sub, delta, deltaType = "neutral", sparkline }: MetricCardProps) {
  return (
    <div className="flex flex-col">
      {/* Number */}
      <div className="text-lg font-semibold text-[#00295B] mb-0.5" style={{ fontFeatureSettings: '"tnum"' }}>
        {num}
      </div>
      
      {/* Sparkline (if present) */}
      {sparkline && sparkline.length > 0 && (
        <div className="h-6 -mx-1 mb-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkline} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`sparkFill-${Math.random()}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8C7D57" stopOpacity="0.12"/>
                  <stop offset="100%" stopColor="#8C7D57" stopOpacity="0.02"/>
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke="#8C7D57"
                strokeWidth={1}
                fill={`url(#sparkFill-${Math.random()})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      
      {/* Label */}
      <div className="text-xs mb-1" style={{ color: 'var(--text, #101720)', opacity: 0.7 }}>
        {sub}
      </div>
      
      {/* Delta badge */}
      {delta && (
        <div className={`text-xs inline-flex items-center gap-1 ${
          deltaType === "positive" ? "text-green-700" :
          deltaType === "negative" ? "text-red-700" :
          "text-[#101720]/70"
        }`} style={{ fontFeatureSettings: '"tnum"' }}>
          {deltaType === "positive" && "▲"}
          {deltaType === "negative" && "▼"}
          <span>{delta}</span>
        </div>
      )}
    </div>
  );
}

interface InfoTooltipProps {
  label: string;
}

export function InfoTooltip({ label }: InfoTooltipProps) {
  return (
    <span 
      className="inline-flex items-center justify-center w-3.5 h-3.5 ml-1 rounded-full bg-[#E5E2D6] text-[#101720] cursor-help"
      title={label}
      style={{ fontSize: "9px", verticalAlign: "middle" }}
    >
      ?
    </span>
  );
}



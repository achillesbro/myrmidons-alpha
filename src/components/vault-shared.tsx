import React from "react";

/**
 * ---------- Formatting helpers ----------
 */
export const fmtToken = (wei: bigint, decimals: number, maxFrac: number = 4) => {
  const neg = wei < 0n;
  const abs = neg ? -wei : wei;
  const base = BigInt(10) ** BigInt(decimals);
  const whole = Number(abs / base);
  const frac = Number(abs % base) / Number(base);
  const num = (neg ? -1 : 1) * (whole + frac);
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.max(0, maxFrac),
  });
};

export const fmtUsdSimple = (v: number, digits: number = 2) =>
  `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: digits })}`;

export const pad2 = (n: number) => String(n).padStart(2, "0");
export const fmtDateTime = (unixSeconds: number) => {
  const d = new Date(unixSeconds * 1000);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};
export const truncHash = (h: string) => (h && h.length > 12 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h);

/**
 * ---------- Error prettifier ----------
 */
export const friendlyError = (err: unknown): string => {
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
  
  // User rejection
  if (m.includes("user rejected") || m.includes("user denied") || m.includes("rejected by user")) {
    return "Transaction was cancelled. Please try again.";
  }
  
  // Network and rate limiting issues
  if (m.includes("429") || m.includes("rate limit") || m.includes("too many requests")) {
    return "Network is busy. Please wait a moment and try again.";
  }
  
  // Gas and simulation issues
  if (m.includes("missing revert data") || m.includes("call_exception") || m.includes("cannot estimate gas") || m.includes("simulation")) {
    return "Transaction simulation failed. Please try again with higher gas limit.";
  }
  
  // Nonce issues (common retry scenario)
  if (m.includes("nonce") || m.includes("replacement transaction underpriced") || m.includes("already known")) {
    return "Transaction conflict detected. Please wait a moment and try again.";
  }
  
  // Network connectivity issues
  if (m.includes("network error") || m.includes("connection") || m.includes("timeout") || m.includes("fetch")) {
    return "Network connection issue. Please check your connection and try again.";
  }
  
  // RPC/Node issues
  if (m.includes("rpc error") || m.includes("internal error") || m.includes("server error") || m.includes("502") || m.includes("503") || m.includes("504")) {
    return "Network temporarily unavailable. Please try again in a few moments.";
  }
  
  // Transaction replacement issues
  if (m.includes("replacement") || m.includes("underpriced") || m.includes("already known")) {
    return "Transaction already in progress. Please wait and try again.";
  }
  
  // Slippage and price impact
  if (m.includes("slippage") || m.includes("price impact") || m.includes("execution reverted")) {
    return "Price changed during transaction. Please try again.";
  }
  
  // Insufficient balance
  if (m.includes("insufficient") && m.includes("balance")) {
    return "Insufficient balance for this transaction.";
  }
  
  // Gas price issues
  if (m.includes("gas price") || m.includes("gas too low") || m.includes("intrinsic gas too low")) {
    return "Gas price too low. Please try again with higher gas.";
  }
  
  // Vault-specific issues
  if (m.includes("cap") && m.includes("deposit")) {
    return "Vault is currently closed for deposits. Please try again later.";
  }
  
  // Generic retry-friendly message for unknown errors
  if (m.includes("error") || m.includes("failed") || m.includes("revert")) {
    return "Transaction failed. Please try again.";
  }
  
  // Fallback for any other error
  return `Transaction error: ${err instanceof Error ? err.message : String(err)}`;
};

/**
 * ---------- LocalStorage keys ----------
 */
export const APPROVAL_PREF_KEY = (chainId?: number, vault?: string, token?: string) =>
  `approvalPref:${chainId ?? 0}:${(vault ?? "").toLowerCase()}:${(token ?? "").toLowerCase()}`;

export const NET_FLOW_STORE_KEY = (chainId?: number, v?: string, u?: string) =>
  `netFlow:${chainId ?? 0}:${(v ?? "").toLowerCase()}:${(u ?? "").toLowerCase()}`;

/**
 * ---------- Small UI building blocks ----------
 */
export const Skeleton = ({ className = "" }: { className?: string }) => (
  <div className={`animate-pulse bg-[#EDEBE3] rounded ${className}`} />
);

export type ToastKind = "info" | "success" | "error";
export type Toast = { id: number; kind: ToastKind; text: string; href?: string };

export const Toasts: React.FC<{ toasts: Toast[] }> = ({ toasts }) => (
  <div className="fixed bottom-4 right-4 z-50 space-y-2">
    {toasts.map((t) => (
      <div
        key={t.id}
        className={
          `px-3 py-2 rounded shadow border text-sm ` +
          (t.kind === "success"
            ? "bg-emerald-50 border-emerald-200 text-emerald-900"
            : t.kind === "error"
            ? "bg-red-50 border-red-200 text-red-900"
            : "bg-[#FFFFF5] border-[#E5E2D6] text-[#101720]")
        }
      >
        {t.href ? (
          <a
            href={t.href}
            target="_blank"
            rel="noreferrer noopener"
            className="underline hover:opacity-80"
          >
            {t.text}
          </a>
        ) : (
          t.text
        )}
      </div>
    ))}
  </div>
);

export const ConfirmDialog: React.FC<{
  open: boolean;
  title?: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}> = ({ open, title = "Confirm", body, confirmLabel = "Confirm", cancelLabel = "Cancel", onConfirm, onCancel, busy }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={busy ? undefined : onCancel} />
      <div className="relative z-50 bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-5 w-[92%] max-w-md">
        <div className="text-lg font-semibold text-[#00295B] mb-2">{title}</div>
        <div className="text-sm text-[#101720] mb-4">{body}</div>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={!!busy}
            className="px-3 py-1.5 text-sm rounded border border-[#E5E2D6] bg-[#FFFFF5] hover:bg-[#F7F6EE] text-[#101720] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!!busy}
            className="px-3 py-1.5 text-sm rounded bg-[#00295B] hover:bg-[#001B3E] text-[#FFFFF5] disabled:opacity-50"
          >
            {busy ? "Processing…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
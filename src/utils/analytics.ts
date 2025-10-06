export function track(event: string, payload?: Record<string, unknown>) {
  // Bridge to Plausible/PostHog later. Keep no-throw here.
  if (typeof window !== 'undefined') {
    (window as any).__MYR_ANALYTICS__?.(event, payload);
  }
}

// src/components/performance-monitor.tsx
import { useEffect, useState } from 'react';

interface PerformanceMetrics {
  rpcCalls: number;
  priceRequests: number;
  cacheHits: number;
  loadTime: number;
  lastUpdate: number;
}

export function PerformanceMonitor() {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    rpcCalls: 0,
    priceRequests: 0,
    cacheHits: 0,
    loadTime: 0,
    lastUpdate: Date.now(),
  });

  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Monitor performance metrics
    const updateMetrics = () => {
      // This would be connected to your actual performance tracking
      // For now, we'll simulate some metrics
      setMetrics(prev => ({
        ...prev,
        lastUpdate: Date.now(),
      }));
    };

    const interval = setInterval(updateMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm shadow-lg hover:bg-blue-700 transition-colors"
      >
        📊 Performance
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 bg-white border border-gray-200 rounded-lg p-4 shadow-lg max-w-sm">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-semibold text-gray-800">Performance Monitor</h3>
        <button
          onClick={() => setIsVisible(false)}
          className="text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      </div>
      
      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-600">RPC Calls:</span>
          <span className="font-mono">{metrics.rpcCalls}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Price Requests:</span>
          <span className="font-mono">{metrics.priceRequests}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Cache Hits:</span>
          <span className="font-mono text-green-600">{metrics.cacheHits}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Load Time:</span>
          <span className="font-mono">{metrics.loadTime}ms</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Last Update:</span>
          <span className="font-mono">{new Date(metrics.lastUpdate).toLocaleTimeString()}</span>
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-gray-200">
        <div className="text-xs text-gray-500">
          💡 Optimizations active: Batch requests, caching, parallel fetching
        </div>
      </div>
    </div>
  );
}

// Hook to track performance metrics
export function usePerformanceTracker() {
  const [startTime, setStartTime] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<Partial<PerformanceMetrics>>({});

  const startTracking = () => {
    setStartTime(Date.now());
  };

  const endTracking = () => {
    if (startTime) {
      const loadTime = Date.now() - startTime;
      setMetrics(prev => ({ ...prev, loadTime }));
      setStartTime(null);
    }
  };

  const trackRpcCall = () => {
    setMetrics(prev => ({ 
      ...prev, 
      rpcCalls: (prev.rpcCalls || 0) + 1 
    }));
  };

  const trackPriceRequest = () => {
    setMetrics(prev => ({ 
      ...prev, 
      priceRequests: (prev.priceRequests || 0) + 1 
    }));
  };

  const trackCacheHit = () => {
    setMetrics(prev => ({ 
      ...prev, 
      cacheHits: (prev.cacheHits || 0) + 1 
    }));
  };

  return {
    metrics,
    startTracking,
    endTracking,
    trackRpcCall,
    trackPriceRequest,
    trackCacheHit,
  };
}

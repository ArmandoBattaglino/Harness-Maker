// client/src/canvas/nodes/TriggerNode.jsx
// Trigger source node — webhook and RSS feed triggers with visual feedback.
import { Handle, Position } from '@xyflow/react';
import { useState, useEffect } from 'react';
import { useSwarmStore } from '../../store/SwarmContext';

const triggerIcons = {
  webhook: '🔗',
  rss: '📡',
};

// type: "trigger"
export default function TriggerNode({ id, data, selected }) {
  const triggerState = useSwarmStore((s) => s.triggerStates[id]);
  const fired = triggerState?.fired ?? false;
  const lastFiredAt = triggerState?.lastFiredAt;
  const status = triggerState?.status ?? 'waiting'; // 'waiting' | 'fired'

  // Local state for reset animation after 2 seconds
  const [showFiredAnimation, setShowFiredAnimation] = useState(false);

  // Trigger the "Fired!" animation when fired state changes to true
  useEffect(() => {
    if (fired) {
      setShowFiredAnimation(true);
      const timer = setTimeout(() => {
        setShowFiredAnimation(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [fired]);

  const icon = triggerIcons[data.triggerType] || '⚡';

  // Format last-fired timestamp
  const formatLastFired = () => {
    if (!lastFiredAt) return '';
    const date = new Date(lastFiredAt);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Determine label based on trigger type
  const getLabel = () => {
    if (data.triggerType === 'webhook') {
      return data.webhookPath ? `${data.label || 'Webhook'} • ${data.webhookPath}` : (data.label || 'Webhook');
    }
    if (data.triggerType === 'rss') {
      // Truncate RSS URL to ~20 chars
      const url = data.rssUrl || '';
      const truncated = url.length > 20 ? url.substring(0, 20) + '…' : url;
      return truncated || (data.label || 'RSS Feed');
    }
    return data.label || 'Trigger';
  };

  return (
    <div
      className={`rounded-lg border-2 bg-purple-950 p-3 min-w-[140px] max-w-[200px]
        text-white text-sm
        ${showFiredAnimation ? 'animate-[triggerFiredPulse_2s_ease-out]' : 'border-purple-500'}
        ${selected ? 'ring-2 ring-white ring-offset-1' : ''}
        cursor-pointer transition-all duration-200`}
    >
      {/* Trigger icon + label */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg flex-shrink-0" role="img" aria-label="trigger">{icon}</span>
        <span className="font-semibold truncate text-xs">{getLabel()}</span>
      </div>

      {/* Status badge */}
      <div className="flex items-center justify-between mt-1 text-xs">
        <span className="text-purple-300 capitalize">
          {data.triggerType || 'webhook'}
        </span>
        {status === 'fired' && (
          <span className="text-green-400 font-semibold">Fired!</span>
        )}
        {status === 'waiting' && (
          <span className="text-purple-400 text-xs">waiting</span>
        )}
      </div>

      {/* Last-fired timestamp (if available) */}
      {lastFiredAt && (
        <div className="text-xs text-purple-300 mt-1 opacity-75">
          Last: {formatLastFired()}
        </div>
      )}

      {/* Only source handle — triggers fire outward to agents */}
      <Handle type="source" position={Position.Bottom} className="!bg-purple-400 !border-purple-600" />
    </div>
  );
}

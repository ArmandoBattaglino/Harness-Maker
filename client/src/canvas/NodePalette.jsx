// client/src/canvas/NodePalette.jsx
// Collapsible left sidebar showing draggable node types for the SwarmCanvas.
// FR-V5-25 through FR-V5-29
import { useState, useCallback } from 'react';

const NODE_CARDS = [
  {
    type: 'agent',
    subType: '',
    icon: '\uD83E\uDD16',
    label: 'Agent Node',
    description: 'AI agent with system prompt',
  },
  {
    type: 'department',
    subType: '',
    icon: '\uD83C\uDFE2',
    label: 'Department',
    description: 'Group of agents',
  },
  {
    type: 'trigger',
    subType: 'webhook',
    icon: '\uD83D\uDD17',
    label: 'Webhook Trigger',
    description: 'HTTP webhook trigger',
  },
  {
    type: 'trigger',
    subType: 'rss',
    icon: '\uD83D\uDCE1',
    label: 'RSS Trigger',
    description: 'RSS feed trigger',
  },
  {
    type: 'conditional',
    subType: '',
    icon: '\u25C6',
    label: 'Conditional Router',
    description: 'IF/THEN branching logic',
  },
  {
    type: 'merge',
    subType: '',
    icon: '\u2B21',
    label: 'Merge / Join',
    description: 'Wait for multiple inputs',
  },
  {
    type: 'delay',
    subType: '',
    icon: '\u23F1',
    label: 'Delay Timer',
    description: 'Pause flow for N seconds',
  },
  {
    type: 'loop',
    subType: '',
    icon: '\uD83D\uDD04',
    label: 'Loop',
    description: 'Iterate with exit condition',
  },
  {
    type: 'errorHandler',
    subType: '',
    icon: '\u26A1',
    label: 'Error Handler',
    description: 'Catch errors from nodes',
  },
  {
    type: 'subWorkflow',
    subType: '',
    icon: '\uD83D\uDCE6',
    label: 'Sub-Workflow',
    description: 'Nested workflow reference',
  },
];

function PaletteCard({ card }) {
  const onDragStart = useCallback(
    (event) => {
      event.dataTransfer.setData('application/reactflow-type', card.type);
      event.dataTransfer.setData('application/reactflow-subtype', card.subType);
      event.dataTransfer.effectAllowed = 'move';
    },
    [card.type, card.subType]
  );

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="bg-gray-800 rounded-lg p-2 mb-2 cursor-grab border border-gray-700 hover:border-gray-500 transition-colors select-none active:opacity-50"
    >
      <div className="flex items-center gap-2">
        <span className="text-base leading-none">{card.icon}</span>
        <span className="text-xs font-medium text-gray-200">{card.label}</span>
      </div>
      <p className="text-[10px] text-gray-500 mt-1 leading-tight">{card.description}</p>
    </div>
  );
}

export default function NodePalette() {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div className="w-8 bg-gray-900 border-r border-gray-700 flex flex-col items-center justify-end py-2 shrink-0">
        <button
          onClick={() => setCollapsed(false)}
          className="text-gray-400 hover:text-gray-200 text-xs transition-colors"
          title="Expand palette"
        >
          &rsaquo;
        </button>
      </div>
    );
  }

  return (
    <div className="w-48 bg-gray-900 border-r border-gray-700 flex flex-col shrink-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
        <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Nodes
        </h3>
        {NODE_CARDS.map((card) => (
          <PaletteCard key={`${card.type}-${card.subType}`} card={card} />
        ))}
      </div>
      <div className="border-t border-gray-700 p-1 flex justify-center">
        <button
          onClick={() => setCollapsed(true)}
          className="text-gray-500 hover:text-gray-300 text-xs transition-colors"
          title="Collapse palette"
        >
          &lsaquo; hide
        </button>
      </div>
    </div>
  );
}

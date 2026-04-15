// client/src/canvas/nodes/PromptBlockEditor.jsx
// Floating panel for inspecting and editing prompt blocks, positioned left of the agent node.
// Single-column layout: shows included blocks + "Add block" button for available ones.
import { useState, useEffect, useCallback, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import PromptBlockCard from './PromptBlockCard';

const SOURCE_COLORS = {
  user: 'bg-blue-500',
  pack: 'bg-purple-500',
  runtime: 'bg-orange-500',
  system: 'bg-gray-500',
  cli: 'bg-red-500',
};

/** Default block definitions — used as fallback when the server preview is unavailable */
const DEFAULT_BLOCKS = [
  { id: 'role',           title: 'Your Role',           source: 'user' },
  { id: 'guardrails',     title: 'Guardrails',          source: 'user' },
  { id: 'guidance',       title: 'Quality Guidance',    source: 'user' },
  { id: 'awareness',      title: 'Agent Awareness',     source: 'runtime' },
  { id: 'inputs',         title: 'Workflow Inputs',     source: 'runtime' },
  { id: 'pack-knowledge', title: 'Pack Knowledge',      source: 'pack' },
  { id: 'pack-rules',     title: 'Pack Behavior Rules', source: 'pack' },
  { id: 'handoffs',       title: 'Inbound Handoffs',    source: 'runtime' },
  { id: 'history',        title: 'Interaction History',  source: 'runtime' },
  { id: 'protocol',       title: 'Protocol',            source: 'system' },
  { id: 'hitl',           title: 'HITL Protocol',        source: 'system' },
];

/** Placeholder descriptions shown when a block has no user content yet */
const EMPTY_PLACEHOLDERS = {
  'role':           '[Not configured — add a system prompt or mission to define this agent\'s role]',
  'guardrails':     '[Not configured — add safety constraints and behavioral limits]',
  'guidance':       '[Not configured — add tools, skill hints, or expected output]',
  'awareness':      '[Populated at runtime: agent identity, peers, and connection status]',
  'inputs':         '[Populated at runtime: workflow run inputs scoped to this agent]',
  'pack-knowledge': '[From pack: domain knowledge and context injected by the linked pack]',
  'pack-rules':     '[From pack: behavioral rules and directives from the linked pack]',
  'handoffs':       '[Populated at runtime: inbound handoff payloads from upstream agents]',
  'history':        '[Populated at runtime: interaction transcript based on context visibility]',
  'protocol':       '=== PROTOCOL ===\nDo real work before emitting any control token.\nWhen done, last line: __HANDOFF__ or __DONE__',
  'hitl':           '[Active only in HITL mode: human-in-the-loop interaction protocol]',
};

function buildLocalBlocks(nodeData, disabled) {
  // Respect custom block order if set
  const customOrder = Array.isArray(nodeData?.promptBlockOrder) ? nodeData.promptBlockOrder : null;
  let orderedDefs = DEFAULT_BLOCKS;
  if (customOrder) {
    const defMap = Object.fromEntries(DEFAULT_BLOCKS.map((d) => [d.id, d]));
    const ordered = customOrder.map((id) => defMap[id]).filter(Boolean);
    // Append any missing defaults at the end
    for (const def of DEFAULT_BLOCKS) {
      if (!ordered.some((d) => d.id === def.id)) ordered.push(def);
    }
    orderedDefs = ordered;
  }
  return orderedDefs.map((def) => {
    const isDisabled = disabled[def.id] && def.source !== 'system';
    let compiledText = '';
    switch (def.id) {
      case 'role': {
        const parts = [(nodeData?.mission || '').trim(), (nodeData?.systemPrompt || '').trim()].filter(Boolean);
        compiledText = parts.length > 0 ? '=== YOUR ROLE ===\n' + parts.join('\n') : '';
        break;
      }
      case 'guardrails': {
        const g = (nodeData?.guardrails || '').trim();
        compiledText = g ? '=== GUARDRAILS ===\n' + g : '';
        break;
      }
      case 'guidance': {
        const lines = [];
        if (Array.isArray(nodeData?.tools) && nodeData.tools.length > 0) lines.push('Tool boundary: ' + nodeData.tools.join(', '));
        if (Array.isArray(nodeData?.skillHints) && nodeData.skillHints.length > 0) lines.push('Preferred skills: ' + nodeData.skillHints.join(', '));
        if (typeof nodeData?.expectedOutput === 'string' && nodeData.expectedOutput.trim()) lines.push('Expected output: ' + nodeData.expectedOutput.trim());
        compiledText = lines.length > 0 ? '=== AGENT QUALITY GUIDANCE ===\n' + lines.join('\n') : '';
        break;
      }
      case 'protocol':
        compiledText = EMPTY_PLACEHOLDERS['protocol'];
        break;
      default:
        break;
    }
    // If no real content, use the placeholder description
    if (!compiledText) {
      compiledText = EMPTY_PLACEHOLDERS[def.id] || '';
    }
    return {
      ...def,
      enabled: !isDisabled,
      compiledText,
      tokenEstimate: Math.ceil((compiledText || '').length / 4),
    };
  });
}

export default function PromptBlockEditor({ nodeId, nodeData, nodePosition, workflowDef, onFieldChange, onClose }) {
  const [blocks, setBlocks] = useState([]);
  const [assembledPrompt, setAssembledPrompt] = useState('');
  const [totalTokenEstimate, setTotalTokenEstimate] = useState(0);
  const [cliInjections, setCliInjections] = useState(null);
  const [blockCount, setBlockCount] = useState(0);
  const [expertMode, setExpertMode] = useState(() => {
    try { return localStorage.getItem('promptBlockEditor.expertMode') === 'true'; } catch { return false; }
  });
  const [expandedBlockId, setExpandedBlockId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copyLabel, setCopyLabel] = useState('Copy assembled prompt');
  const [showAddMenu, setShowAddMenu] = useState(false);
  // Pointer-based drag state
  const [dragState, setDragState] = useState(null); // { index, startY, currentY, offsetY }
  const blockRefs = useRef([]);
  const cardRef = useRef(null);
  const addMenuRef = useRef(null);
  const debounceRef = useRef(null);

  // Stable fingerprint of nodeData fields that affect block content
  const dataFingerprint = JSON.stringify([
    nodeData?.systemPrompt || '',
    nodeData?.mission || '',
    nodeData?.guardrails || '',
    nodeData?.tools || [],
    nodeData?.skillHints || [],
    nodeData?.expectedOutput || '',
    nodeData?.expectedOutputFormat || '',
    nodeData?.expectedOutputContract || null,
    nodeData?.contextSources || [],
    nodeData?.promptBlockOrder || null,
    nodeData?.promptBlockDisabled || null,
  ]);

  // Rebuild blocks from local data (instant, no server round-trip)
  const rebuildLocal = useCallback(() => {
    const disabled = nodeData?.promptBlockDisabled || {};
    const localBlocks = buildLocalBlocks(nodeData, disabled);
    setBlocks(localBlocks);
    const enabledBlocks = localBlocks.filter((b) => b.enabled && b.compiledText && !b.compiledText.startsWith('['));
    const assembled = enabledBlocks.map((b) => b.compiledText).join('\n\n');
    setAssembledPrompt(assembled);
    setTotalTokenEstimate(Math.ceil(assembled.length / 4));
    setBlockCount(enabledBlocks.length);
    // Provide local CLI injections fallback so Expert mode works even without server
    if (!cliInjections) {
      const nodeTools = Array.isArray(nodeData?.tools) ? nodeData.tools : ['Bash', 'Read', 'Edit', 'Write', 'Grep', 'Glob', 'LS'];
      const nodeModel = nodeData?.model || 'opus';
      setCliInjections({
        bootstrapPrompt: 'Claude runtime is active for this Swarm agent.\nContinue the workflow using the shared task context below.',
        appendSystemPrompt: null,
        launchFlags: ['--model', nodeModel, '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions', '--tools', nodeTools.join(',')],
        claudeMdContent: null,
        claudeMdPath: null,
        toolsAllowlist: nodeTools,
        totalCliTokenEstimate: 85,
      });
    }
    setLoading(false);
  }, [nodeData, cliInjections]);

  // Server fetch (debounced, for richer preview with pack/workflow context)
  const fetchFromServer = useCallback(async () => {
    if (!workflowDef || !Array.isArray(workflowDef.nodes) || !workflowDef.nodes.some((n) => n.id === nodeId)) return;
    try {
      const resp = await fetch('/api/v1/swarm/prompt-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ClaudeCodeManager' },
        body: JSON.stringify({ workflowDef, selectedAgentId: nodeId }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setBlocks(data.blocks || []);
        setAssembledPrompt(data.assembledPrompt || '');
        setTotalTokenEstimate(data.totalTokenEstimate || 0);
        setBlockCount(data.blockCount || 0);
        setCliInjections(data.cliInjections || null);
      }
    } catch (err) {
      console.warn('prompt-preview server fetch failed:', err.message);
    }
  }, [workflowDef, nodeId]);

  // On mount: build local immediately, then try server
  useEffect(() => {
    rebuildLocal();
    fetchFromServer();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // On nodeData change: rebuild local instantly, debounce server fetch
  useEffect(() => {
    rebuildLocal();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { fetchFromServer(); }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [dataFingerprint, rebuildLocal, fetchFromServer]); // eslint-disable-line react-hooks/exhaustive-deps

  // Expert mode persistence
  useEffect(() => {
    try { localStorage.setItem('promptBlockEditor.expertMode', String(expertMode)); } catch { /* ignore */ }
  }, [expertMode]);

  // Escape handler
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        if (showAddMenu) {
          e.stopPropagation();
          setShowAddMenu(false);
          return;
        }
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [onClose, showAddMenu]);

  // Click-outside handler
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (cardRef.current && !cardRef.current.contains(e.target)) {
        const isInsideNode = e.target.closest('.react-flow__node');
        if (!isInsideNode) onClose();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Close add menu when clicking outside it
  useEffect(() => {
    if (!showAddMenu) return;
    const handler = (e) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target)) {
        setShowAddMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAddMenu]);

  // Split blocks into included (enabled) and available (disabled)
  // IMPORTANT: must be defined before useCallback hooks that reference them (TDZ)
  const includedBlocks = blocks.filter((b) => b.enabled);
  const availableBlocks = blocks.filter((b) => !b.enabled && b.source !== 'system');

  // Re-center canvas when the detail panel opens (matrioska zoom).
  // 3 components: detail (380px) + list (420px) + node (~180px), all CSS overlays.
  const { setCenter: rfSetCenter, getZoom: rfGetZoom } = useReactFlow();
  useEffect(() => {
    if (!expandedBlockId) return;
    const rfContainer = document.querySelector('.react-flow');
    if (!rfContainer) return;
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        const { width: cW, height: cH } = rfContainer.getBoundingClientRect();
        const nX = nodePosition?.x ?? 0;
        const nY = nodePosition?.y ?? 0;
        // Estimate node width from the DOM element
        const nodeEl = document.querySelector(`[data-id="${nodeId}"]`);
        const nW = nodeEl ? nodeEl.offsetWidth / (rfGetZoom() || 1) : 180;

        const DETAIL_W = 380;
        const DETAIL_GAP = 14;
        const LIST_W = 420;
        const LIST_GAP = 14;
        const PANEL_H = 560;
        const PAD = 24;

        // Calculate zoom to fit all 3 horizontally
        const maxZ = (cW - DETAIL_W - DETAIL_GAP - LIST_W - LIST_GAP - PAD * 2) / (nW || 180);
        const Z = Math.max(0.2, Math.min(maxZ, 1.0));

        // Bbox in screen pixels: [detail][gap][list][gap][node]
        const nodeScreenW = (nW || 180) * Z;
        const bboxW = DETAIL_W + DETAIL_GAP + LIST_W + LIST_GAP + nodeScreenW;
        // Node screen position: right side of the bbox
        const nodeScreenX = (cW - bboxW) / 2 + DETAIL_W + DETAIL_GAP + LIST_W + LIST_GAP;
        const nodeScreenY = (cH - PANEL_H) / 2;

        // Convert to flow center: setCenter(fx,fy,{zoom:Z}) puts (fx,fy) at screen center
        const fx = nX - (nodeScreenX - cW / 2) / Z;
        const fy = nY - (nodeScreenY - cH / 2) / Z;

        rfSetCenter(fx, fy, { zoom: Z, duration: 300 });
      });
      return () => cancelAnimationFrame(raf2);
    });
    return () => cancelAnimationFrame(raf1);
  }, [expandedBlockId, nodeId, nodePosition, rfSetCenter, rfGetZoom]);

  // Copy handler
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(assembledPrompt);
      setCopyLabel('Copied!');
      setTimeout(() => setCopyLabel('Copy assembled prompt'), 2000);
    } catch { /* clipboard is best-effort */ }
  }, [assembledPrompt]);

  // Pointer-based drag reorder — commits order LIVE during drag.
  // The DOM always reflects the current order so there's no flicker on release.
  // Only the dragged item uses translateY to follow the mouse.
  const lastCommittedTarget = useRef(null);
  const handleDragPointerDown = useCallback((dragIndex) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = blockRefs.current[dragIndex]?.getBoundingClientRect();
    if (!rect) return;
    const offsetY = e.clientY - rect.top;
    const itemHeight = rect.height + 4;
    // Track the block ID being dragged (stable across reorders)
    const draggedBlockId = includedBlocks[dragIndex]?.id;
    if (!draggedBlockId) return;
    lastCommittedTarget.current = dragIndex;
    setDragState({ draggedBlockId, startY: e.clientY, currentY: e.clientY, offsetY, itemHeight });

    const handleMove = (ev) => {
      setDragState((prev) => prev ? { ...prev, currentY: ev.clientY } : null);
    };
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      lastCommittedTarget.current = null;
      setDragState(null);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }, [includedBlocks]);

  // Live reorder: when the dragged item crosses a row boundary, commit immediately
  useEffect(() => {
    if (!dragState || !dragState.draggedBlockId) return;
    const currentIdx = includedBlocks.findIndex((b) => b.id === dragState.draggedBlockId);
    if (currentIdx === -1) return;
    const dragDelta = dragState.currentY - dragState.startY;
    const rowsMoved = Math.round(dragDelta / dragState.itemHeight);
    const targetIdx = Math.max(0, Math.min(currentIdx + rowsMoved, includedBlocks.length - 1));
    if (targetIdx === currentIdx || targetIdx === lastCommittedTarget.current) return;
    // Commit reorder
    lastCommittedTarget.current = targetIdx;
    const currentOrder = includedBlocks.map((b) => b.id);
    const [moved] = currentOrder.splice(currentIdx, 1);
    currentOrder.splice(targetIdx, 0, moved);
    const disabledIds = blocks.filter((b) => !b.enabled).map((b) => b.id);
    onFieldChange('promptBlockOrder', [...currentOrder, ...disabledIds]);
    // Reset startY so the dragged item tracks from the new position
    const newStartY = dragState.startY + (targetIdx - currentIdx) * dragState.itemHeight;
    setDragState((prev) => prev ? { ...prev, startY: newStartY } : null);
  }, [dragState?.currentY]); // eslint-disable-line react-hooks/exhaustive-deps

  // Add block: remove from disabled set
  const handleAddBlock = useCallback((blockId) => {
    const disabled = { ...(nodeData?.promptBlockDisabled || {}) };
    delete disabled[blockId];
    onFieldChange('promptBlockDisabled', disabled);
    setShowAddMenu(false);
  }, [nodeData, onFieldChange]);

  // Remove block: add to disabled set
  const handleRemoveBlock = useCallback((blockId) => {
    const disabled = { ...(nodeData?.promptBlockDisabled || {}) };
    disabled[blockId] = true;
    onFieldChange('promptBlockDisabled', disabled);
  }, [nodeData, onFieldChange]);

  const agentName = nodeData?.label || nodeData?.name || 'Agent';
  const cliTokens = cliInjections?.totalCliTokenEstimate || 0;
  const includedCount = includedBlocks.length;

  return (
    <div
      ref={cardRef}
      className="nowheel nodrag nopan absolute top-0 right-[calc(100%+14px)] w-[420px] max-h-[560px] rounded-lg border border-indigo-500/30 bg-gray-950/[0.98] backdrop-blur-sm shadow-[0_8px_18px_rgba(0,0,0,0.28)] flex flex-col z-50 text-white text-sm"
      style={{ animation: 'promptEditorSlideIn 0.2s ease-out' }}
      onClick={(e) => e.stopPropagation()}
      onWheelCapture={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium text-gray-200 truncate">{agentName}</span>
            <span className="text-xs text-gray-500">{includedCount} blocks</span>
            <span className="text-xs text-gray-500">~{totalTokenEstimate} tok{cliTokens > 0 ? ` (+${cliTokens} CLI)` : ''}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExpertMode(!expertMode)}
              className={`text-xs px-1.5 py-0.5 rounded transition-colors ${expertMode ? 'bg-red-500/20 text-red-400' : 'bg-gray-700/50 text-gray-500 hover:text-gray-400'}`}
            >
              Expert
            </button>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-white text-sm leading-none w-5 h-5 flex items-center justify-center rounded hover:bg-gray-700/60 transition-colors"
              aria-label="Close"
            >
              &times;
            </button>
          </div>
        </div>
        {/* Add block — in header, dropdown opens downward inside the scrollable body */}
        {availableBlocks.length > 0 && (
          <div className="relative mt-1.5" ref={addMenuRef}>
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="w-full py-1 border border-dashed border-gray-700/50 rounded text-xs text-gray-500 hover:text-gray-300 hover:border-indigo-500/40 transition-colors flex items-center justify-center gap-1"
            >
              <span className="text-sm leading-none">+</span>
              Add block ({availableBlocks.length})
            </button>
            {showAddMenu && (
              <div className="absolute left-0 right-0 mt-1 rounded-lg border border-gray-700/60 bg-gray-900/95 backdrop-blur-sm shadow-lg z-20 py-1 max-h-[220px] overflow-y-auto">
                {availableBlocks.map((block) => (
                  <button
                    key={block.id}
                    onClick={() => handleAddBlock(block.id)}
                    className="w-full px-3 py-1.5 text-left text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 flex items-center gap-2 transition-colors"
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${SOURCE_COLORS[block.source] || 'bg-gray-500'}`} />
                    <span className="flex-1">{block.title}</span>
                    <span className="text-[10px] text-gray-600">{block.source}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating detail panel — positioned to the LEFT of this panel (matrioska) */}
      {expandedBlockId && (() => {
        let selectedBlock = [...includedBlocks].find((b) => b.id === expandedBlockId);
        if (!selectedBlock && cliInjections) {
          const cliBlocks = [
            { id: 'cli-bootstrap', title: 'Runtime Bootstrap', text: cliInjections.bootstrapPrompt || '' },
            { id: 'cli-system-prompt', title: 'CLI System Prompt', text: cliInjections.appendSystemPrompt || '[Not active]' },
            { id: 'cli-flags', title: 'CLI Launch Flags', text: (cliInjections.launchFlags || []).join(' ') },
            { id: 'cli-claude-md', title: 'Project Instructions (CLAUDE.md)', text: cliInjections.claudeMdContent || '[No project CLAUDE.md found]' },
            { id: 'cli-tools-allowlist', title: 'Tool Allowlist', text: (cliInjections.toolsAllowlist || []).join(', ') },
          ];
          const found = cliBlocks.find((c) => c.id === expandedBlockId);
          if (found) {
            selectedBlock = { id: found.id, title: found.title, source: 'cli', enabled: true, compiledText: found.text, tokenEstimate: Math.ceil(found.text.length / 4) };
          }
        }
        if (!selectedBlock) return null;
        const isUserBlock = selectedBlock.source === 'user';
        return (
          <div
            className="nowheel nodrag nopan absolute top-0 right-[calc(100%+14px)] w-[380px] max-h-[520px] rounded-lg border border-indigo-500/30 bg-gray-950/[0.98] backdrop-blur-sm shadow-[0_8px_18px_rgba(0,0,0,0.28)] flex flex-col z-50 text-white text-sm"
            style={{ animation: 'promptEditorSlideIn 0.2s ease-out' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Detail header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700/50">
              <span className={`w-2.5 h-2.5 rounded-full ${SOURCE_COLORS[selectedBlock.source] || 'bg-gray-500'}`} />
              <span className="text-sm font-medium text-gray-200 flex-1 truncate">{selectedBlock.title}</span>
              <span className="text-[10px] text-gray-500">~{selectedBlock.tokenEstimate} tok</span>
              <button
                onClick={() => setExpandedBlockId(null)}
                className="text-gray-500 hover:text-white text-sm leading-none w-5 h-5 flex items-center justify-center rounded hover:bg-gray-700/60 transition-colors"
              >&times;</button>
            </div>

            {/* Detail body */}
            <div className="flex-1 overflow-y-auto px-3 py-2 prompt-editor-scrollbar min-h-0 space-y-2">
              {/* Editable form fields for user blocks */}
              {isUserBlock && selectedBlock.id === 'role' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] text-gray-500 block">Mission</label>
                  <textarea
                    value={nodeData?.mission || ''}
                    onChange={(e) => onFieldChange?.('mission', e.target.value)}
                    className="w-full bg-gray-800/50 border border-gray-700/50 rounded text-xs text-gray-300 p-1.5 resize-none focus:border-indigo-500/50 focus:outline-none"
                    rows={2} placeholder="Agent mission..."
                  />
                  <label className="text-[10px] text-gray-500 block">System Prompt</label>
                  <textarea
                    value={nodeData?.systemPrompt || ''}
                    onChange={(e) => onFieldChange?.('systemPrompt', e.target.value)}
                    className="w-full bg-gray-800/50 border border-gray-700/50 rounded text-xs text-gray-300 p-1.5 resize-none focus:border-indigo-500/50 focus:outline-none"
                    rows={5} placeholder="System prompt..."
                  />
                </div>
              )}
              {isUserBlock && selectedBlock.id === 'guardrails' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] text-gray-500 block">Guardrails</label>
                  <textarea
                    value={nodeData?.guardrails || ''}
                    onChange={(e) => onFieldChange?.('guardrails', e.target.value)}
                    className="w-full bg-gray-800/50 border border-gray-700/50 rounded text-xs text-gray-300 p-1.5 resize-none focus:border-indigo-500/50 focus:outline-none"
                    rows={5} placeholder="Constraints and safety rules..."
                  />
                </div>
              )}
              {isUserBlock && selectedBlock.id === 'guidance' && (
                <div className="text-[10px] text-gray-500">
                  Configure tools, skill hints, and expected output for this agent.
                </div>
              )}

              {/* Preview — always shown */}
              <div>
                <div className="text-[10px] text-gray-500 mb-1">Preview — what the agent will receive</div>
                <pre className="text-[11px] text-gray-400 bg-gray-800/30 rounded p-2 overflow-x-auto max-h-[220px] overflow-y-auto whitespace-pre-wrap break-words font-mono">
                  {selectedBlock.compiledText || '[empty]'}
                </pre>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Body — block list */}
      <div className="flex-1 flex flex-col min-h-0">
        {loading ? (
          <div className="text-gray-500 text-sm text-center py-4">Loading preview...</div>
        ) : (
          <>
            {/* Block list — always compact, scrollable */}
            <div className="overflow-y-auto px-3 py-2 space-y-1 prompt-editor-scrollbar min-h-0 flex-1">
              {includedBlocks.length === 0 && (
                <div className="text-gray-600 text-xs text-center py-4 border border-dashed border-gray-700/50 rounded">
                  No blocks in prompt yet. Click + to add blocks.
                </div>
              )}
              {includedBlocks.map((block, index) => {
                const isDragging = dragState?.draggedBlockId === block.id;
                const dragDeltaY = isDragging ? dragState.currentY - dragState.startY : 0;
                const isSelected = expandedBlockId === block.id;

                return (
                  <div
                    key={block.id}
                    ref={(el) => { blockRefs.current[index] = el; }}
                    style={isDragging ? {
                      position: 'relative', zIndex: 100,
                      transform: `translateY(${dragDeltaY}px) scale(1.02)`,
                      opacity: 0.95, pointerEvents: 'none',
                      boxShadow: '0 6px 20px rgba(99,102,241,0.3)',
                    } : undefined}
                  >
                    <div
                      className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer select-none transition-colors ${isSelected ? 'bg-indigo-500/15 border border-indigo-500/40' : 'border border-transparent hover:bg-gray-800/40'}`}
                      onClick={() => { if (!dragState) setExpandedBlockId(isSelected ? null : block.id); }}
                    >
                      {block.source !== 'cli' && (
                        <span
                          className="text-gray-600 hover:text-indigo-400 text-sm cursor-grab active:cursor-grabbing select-none touch-none"
                          onPointerDown={handleDragPointerDown(index)}
                          onClick={(e) => e.stopPropagation()}
                        >&#x2261;</span>
                      )}
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${SOURCE_COLORS[block.source] || 'bg-gray-500'}`} />
                      <span className="text-xs font-medium text-gray-300 flex-1 truncate">{block.title}</span>
                      <span className="text-[10px] text-gray-600">[{block.source}]</span>
                      {block.source !== 'system' && block.source !== 'cli' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveBlock(block.id); }}
                          className="text-[10px] text-gray-600 hover:text-red-400 px-0.5 transition-colors"
                          title="Remove"
                        >&minus;</button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Expert CLI toggle area */}
              {expertMode && cliInjections && (
                <div className="mt-1 pt-1 border-t border-red-500/20">
                  <div className="text-[10px] text-red-400 mb-1 font-medium">CLI Injections</div>
                  {[
                    { id: 'cli-bootstrap', title: 'Runtime Bootstrap', text: cliInjections.bootstrapPrompt || '' },
                    { id: 'cli-system-prompt', title: 'CLI System Prompt', text: cliInjections.appendSystemPrompt || '[Not active]', warn: !!cliInjections.appendSystemPrompt },
                    { id: 'cli-flags', title: 'CLI Launch Flags', text: (cliInjections.launchFlags || []).join(' ') },
                    { id: 'cli-claude-md', title: 'Project Instructions (CLAUDE.md)', text: cliInjections.claudeMdContent || '[No project CLAUDE.md found]' },
                    { id: 'cli-tools-allowlist', title: 'Tool Allowlist', text: (cliInjections.toolsAllowlist || []).join(', ') },
                  ].map((cli) => {
                    const isSelected = expandedBlockId === cli.id;
                    return (
                      <div
                        key={cli.id}
                        className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer select-none transition-colors ${isSelected ? 'bg-red-500/10 border border-red-500/30' : 'border border-transparent hover:bg-gray-800/40'}`}
                        onClick={() => setExpandedBlockId(isSelected ? null : cli.id)}
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0 bg-red-500" />
                        <span className="text-xs text-gray-400 flex-1 truncate">{cli.title}</span>
                        {cli.warn && <span className="text-amber-400 text-[10px]">&#9888;</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Detail panel is now a separate floating card to the left — see above */}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-gray-700/50">
        <button
          onClick={handleCopy}
          className="w-full text-xs text-gray-400 hover:text-gray-200 py-1 rounded bg-gray-800/50 hover:bg-gray-700/50 transition-colors"
        >
          {copyLabel}
        </button>
      </div>
    </div>
  );
}

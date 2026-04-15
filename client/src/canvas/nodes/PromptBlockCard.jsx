// client/src/canvas/nodes/PromptBlockCard.jsx
// Individual block card for the Prompt Block Editor panel.

const SOURCE_COLORS = {
  user: 'bg-blue-500',
  pack: 'bg-purple-500',
  runtime: 'bg-orange-500',
  system: 'bg-gray-500',
  cli: 'bg-red-500',
};

const SOURCE_LABELS = {
  user: 'user-authored',
  pack: 'from pack',
  runtime: 'runtime only',
  system: 'system',
  cli: 'cli injection',
};

export default function PromptBlockCard({
  block,
  index,
  isExpanded,
  onToggleExpand,
  onRemove,
  onDragHandlePointerDown,
  onFieldChange,
  nodeData,
  readOnly,
  warning,
}) {
  const dotColor = SOURCE_COLORS[block.source] || 'bg-gray-500';
  const sourceLabel = SOURCE_LABELS[block.source] || block.source;
  const snippet = (block.compiledText || '').slice(0, 80).replace(/\n/g, ' ');
  const isSystem = block.source === 'system';
  const isCli = block.source === 'cli';
  const canRemove = !isSystem && !isCli && !readOnly && onRemove;

  return (
    <div className="rounded border border-gray-700/50 bg-gray-900/50">
      {/* Header -- always visible */}
      <div
        className="flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none"
        onClick={onToggleExpand}
      >
        {/* Drag handle */}
        {onDragHandlePointerDown && (
          <span
            className="text-gray-600 hover:text-indigo-400 text-sm cursor-grab active:cursor-grabbing select-none touch-none"
            onPointerDown={onDragHandlePointerDown}
            onClick={(e) => e.stopPropagation()}
            title="Drag to reorder"
          >&#x2261;</span>
        )}
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
        <span className="text-xs font-medium text-gray-300 flex-1 truncate">
          {block.title}
          {warning && <span className="ml-1 text-amber-400 text-[10px]">&#9888;</span>}
        </span>
        <span className="text-[10px] text-gray-600">[{sourceLabel}]</span>
        {canRemove && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="text-[10px] text-gray-600 hover:text-red-400 px-1 rounded transition-colors"
            title="Remove from prompt"
          >&minus;</button>
        )}
        <span className="text-gray-600 text-[10px]">{isExpanded ? '\u25B2' : '\u25BC'}</span>
      </div>

      {/* Collapsed snippet */}
      {!isExpanded && snippet && (
        <div className="px-2 pb-1.5 text-[11px] text-gray-500 truncate">{snippet}</div>
      )}

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-2 pb-2 space-y-2">
          {/* Form fields for editable user blocks */}
          {block.source === 'user' && !readOnly && (
            <div className="space-y-1.5">
              {block.id === 'role' && (
                <>
                  <label className="text-[10px] text-gray-500 block">Mission</label>
                  <textarea
                    value={nodeData?.mission || ''}
                    onChange={(e) => onFieldChange?.('mission', e.target.value)}
                    className="w-full bg-gray-800/50 border border-gray-700/50 rounded text-xs text-gray-300 p-1.5 resize-none focus:border-indigo-500/50 focus:outline-none"
                    rows={2}
                    placeholder="Agent mission..."
                  />
                  <label className="text-[10px] text-gray-500 block">System Prompt</label>
                  <textarea
                    value={nodeData?.systemPrompt || ''}
                    onChange={(e) => onFieldChange?.('systemPrompt', e.target.value)}
                    className="w-full bg-gray-800/50 border border-gray-700/50 rounded text-xs text-gray-300 p-1.5 resize-none focus:border-indigo-500/50 focus:outline-none"
                    rows={3}
                    placeholder="System prompt..."
                  />
                </>
              )}
              {block.id === 'guardrails' && (
                <>
                  <label className="text-[10px] text-gray-500 block">Guardrails</label>
                  <textarea
                    value={nodeData?.guardrails || ''}
                    onChange={(e) => onFieldChange?.('guardrails', e.target.value)}
                    className="w-full bg-gray-800/50 border border-gray-700/50 rounded text-xs text-gray-300 p-1.5 resize-none focus:border-indigo-500/50 focus:outline-none"
                    rows={3}
                    placeholder="Constraints and safety rules..."
                  />
                </>
              )}
              {block.id === 'guidance' && (
                <div className="text-[10px] text-gray-500">
                  Edit tools, skill hints, and expected output via the block editor fields.
                </div>
              )}
            </div>
          )}

          {/* Preview */}
          <div>
            <div className="text-[10px] text-gray-500 mb-1">Preview</div>
            <pre className="text-[11px] text-gray-400 bg-gray-800/30 rounded p-2 overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap break-words font-mono">
              {block.compiledText || '[empty]'}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

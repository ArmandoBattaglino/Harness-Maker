// client/src/canvas/NodePalette.jsx
// Collapsible left sidebar showing draggable node types + saved workflows for the SwarmCanvas.
// FR-V5-25 through FR-V5-29
import { useState, useCallback, useRef } from 'react';
import { CANONICAL_VISUAL_INPUT_NODE_TYPE } from '../utils/visualIoContracts.js';

const NODE_CARDS = [
  {
    type: 'agent',
    subType: '',
    label: 'Agent Node',
    description: 'AI agent with system prompt',
  },
  {
    type: CANONICAL_VISUAL_INPUT_NODE_TYPE,
    subType: '',
    label: 'Input Block',
    description: 'Collect text, JSON, or image input at run start',
  },
  {
    type: 'outputExtractor',
    subType: '',
    label: 'Output Extractor',
    description: 'Turn upstream agent output into a named artifact',
  },
  {
    type: 'department',
    subType: '',
    label: 'Department',
    description: 'Group of agents',
  },
  {
    type: 'trigger',
    subType: 'webhook',
    label: 'Webhook Trigger',
    description: 'HTTP webhook trigger',
  },
];

const NODE_ICONS = {
  agent: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
    </svg>
  ),
  department: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M4 16.5v-13h-.25a.75.75 0 010-1.5h12.5a.75.75 0 010 1.5H16v13h.25a.75.75 0 010 1.5H3.75a.75.75 0 010-1.5H4zm3-11a.5.5 0 01.5-.5h1a.5.5 0 01.5.5v1a.5.5 0 01-.5.5h-1a.5.5 0 01-.5-.5v-1zm.5 3.5a.5.5 0 00-.5.5v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5v-1a.5.5 0 00-.5-.5h-1zm3.5-3.5a.5.5 0 01.5-.5h1a.5.5 0 01.5.5v1a.5.5 0 01-.5.5h-1a.5.5 0 01-.5-.5v-1zm.5 3.5a.5.5 0 00-.5.5v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5v-1a.5.5 0 00-.5-.5h-1zM8.5 13a.5.5 0 00-.5.5v3h4v-3a.5.5 0 00-.5-.5h-3z" clipRule="evenodd" />
    </svg>
  ),
  trigger: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M12.577 4.878a.75.75 0 01.919-.53l4.78 1.281a.75.75 0 01.531.919l-1.281 4.78a.75.75 0 01-1.449-.388l.81-3.022a19.407 19.407 0 00-5.594 5.203.75.75 0 01-1.139.093L7 10.06l-4.72 4.72a.75.75 0 01-1.06-1.06l5.25-5.25a.75.75 0 011.06 0l3.074 3.073a20.923 20.923 0 015.545-4.931l-3.042.815a.75.75 0 01-.53-.919z" clipRule="evenodd" />
    </svg>
  ),
  [CANONICAL_VISUAL_INPUT_NODE_TYPE]: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M3 4.75A1.75 1.75 0 014.75 3h6.5A1.75 1.75 0 0113 4.75V8h2.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0115.25 17h-6.5A1.75 1.75 0 017 15.25V12H4.75A1.75 1.75 0 013 10.25v-5.5zM8.5 12v3.25c0 .138.112.25.25.25h6.5a.25.25 0 00.25-.25v-5.5a.25.25 0 00-.25-.25H13v.75A1.75 1.75 0 0111.25 12H8.5z" clipRule="evenodd" />
    </svg>
  ),
  outputExtractor: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M4.25 3A2.25 2.25 0 002 5.25v2.5A2.25 2.25 0 004.25 10h1.5A2.25 2.25 0 008 7.75v-2.5A2.25 2.25 0 005.75 3h-1.5zM14.25 10A2.25 2.25 0 0012 12.25v2.5A2.25 2.25 0 0014.25 17h1.5A2.25 2.25 0 0018 14.75v-2.5A2.25 2.25 0 0015.75 10h-1.5z" />
      <path fillRule="evenodd" d="M9.03 5.47a.75.75 0 011.06 0l3.25 3.25a.75.75 0 01-1.06 1.06l-1.97-1.97v4.44a.75.75 0 01-1.5 0V7.81L6.84 9.78a.75.75 0 11-1.06-1.06l3.25-3.25z" clipRule="evenodd" />
    </svg>
  ),
};

function PaletteCard({ card }) {
  const onDragStart = useCallback(
    (event) => {
      event.dataTransfer.setData('application/reactflow-type', card.type);
      event.dataTransfer.setData('application/reactflow-subtype', card.subType);
      event.dataTransfer.effectAllowed = 'move';
    },
    [card.type, card.subType]
  );

  const icon = NODE_ICONS[card.type] ?? null;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="bg-gray-800/80 rounded-lg p-2.5 mb-2 cursor-grab border border-gray-700/80 hover:border-blue-500/50 hover:bg-gray-750 transition-all duration-150 select-none active:scale-[0.97] active:opacity-70"
    >
      <div className="flex items-center gap-2">
        <span className="text-blue-400 shrink-0">{icon}</span>
        <span className="text-xs font-medium text-gray-200">{card.label}</span>
      </div>
      <p className="text-[10px] text-gray-500 mt-1 leading-tight pl-6">{card.description}</p>
    </div>
  );
}

function SavedWorkflowsSection({
  workflows,
  selectedWorkflowId,
  onSelectWorkflow,
  onLoad,
  onRefresh,
  onDuplicate,
  onExport,
  onImport,
  loading,
  disabled,
  hasWorkflowDef,
  error,
  importError,
  onDismissImportError,
  projectLabel,
  showHeader = true,
}) {
  const fileInputRef = useRef(null);
  const [sectionOpen, setSectionOpen] = useState(true);

  return (
    <div className={showHeader ? 'border-t border-gray-700/60 mt-1' : ''}>
      {showHeader && (
        <button
          onClick={() => setSectionOpen((v) => !v)}
          className="flex items-center justify-between w-full px-2.5 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-widest hover:text-gray-300 transition-colors"
        >
          <span>Workflows</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`w-3 h-3 transition-transform ${sectionOpen ? 'rotate-180' : ''}`}
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </button>
      )}

      {sectionOpen && (
        <div className="px-2.5 pb-2.5 space-y-2">
          <select
            value={selectedWorkflowId}
            onChange={(e) => onSelectWorkflow(e.target.value)}
            disabled={loading || workflows.length === 0 || disabled}
            className="w-full bg-gray-800 text-white text-[11px] rounded-lg px-2 py-1.5 border border-gray-600 disabled:opacity-50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 outline-none transition-colors"
          >
            <option value="">
              {loading
                ? 'Loading...'
                : workflows.length === 0
                ? 'No workflows'
                : 'Select...'}
            </option>
            {workflows.map((wf) => {
              const dateStr = wf.updatedAt ?? wf.createdAt;
              const suffix = dateStr
                ? ` (${new Date(dateStr).toLocaleDateString()})`
                : '';
              return (
                <option key={wf.id} value={wf.id}>
                  {wf.name}{suffix}
                </option>
              );
            })}
          </select>

          <div className="flex flex-wrap gap-1">
            <button
              onClick={onLoad}
              disabled={!selectedWorkflowId || disabled}
              className="flex-1 text-[10px] px-2 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Load
            </button>
            <button
              onClick={onRefresh}
              disabled={loading}
              className="text-[10px] px-1.5 py-1 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600 transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H4.28a.75.75 0 00-.75.75v3.955a.75.75 0 001.5 0v-2.136l.312.311a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm-7.468-4.899A5.5 5.5 0 0117.044 9h-2.434a.75.75 0 000 1.5h3.955a.75.75 0 00.75-.75V5.795a.75.75 0 00-1.5 0v2.136a7 7 0 00-11.712 3.138.75.75 0 001.449.39 5.5 5.5 0 01-.708-4.934z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          <div className="flex flex-wrap gap-1">
            <button
              onClick={onDuplicate}
              disabled={!hasWorkflowDef || disabled}
              className="text-[10px] px-2 py-1 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Duplicate
            </button>
            <button
              onClick={onExport}
              disabled={!hasWorkflowDef || disabled}
              className="text-[10px] px-2 py-1 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Export
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="text-[10px] px-2 py-1 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Import
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={onImport}
            />
          </div>

          {error && (
            <p className="text-[10px] text-red-400 leading-tight">Failed: {error}</p>
          )}
          {importError && (
            <div className="flex items-center gap-1 text-[10px] text-red-300 leading-tight">
              <span>Import: {importError}</span>
              <button onClick={onDismissImportError} className="text-red-400 hover:text-white ml-auto shrink-0">x</button>
            </div>
          )}
          {projectLabel && (
            <p className="text-[9px] text-gray-500 leading-tight">{projectLabel}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function NodePalette({ workflowProps }) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState('build');

  if (collapsed) {
    return (
      <div className="w-9 bg-gray-900/80 border-r border-gray-700/60 flex flex-col items-center justify-start pt-3 shrink-0">
        <button
          onClick={() => setCollapsed(false)}
          className="text-gray-500 hover:text-gray-200 transition-colors p-1 rounded-md hover:bg-gray-800"
          title="Expand node palette"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 010-1.06z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="w-52 bg-gray-900/80 border-r border-gray-700/60 flex flex-col shrink-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5">
        {workflowProps && (
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg border border-gray-700/70 bg-gray-950/50 p-1">
            <button
              type="button"
              onClick={() => setActiveSection('build')}
              className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                activeSection === 'build'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
              }`}
            >
              Build
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('workflows')}
              className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                activeSection === 'workflows'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
              }`}
            >
              Workflows
            </button>
          </div>
        )}

        {activeSection === 'build' && (
          <>
            <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-3">
              Build
            </h3>
            {NODE_CARDS.map((card) => (
              <PaletteCard key={`${card.type}-${card.subType}`} card={card} />
            ))}
          </>
        )}

        {workflowProps && activeSection === 'workflows' && (
          <div>
            <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-3">
              Workflows
            </h3>
            <SavedWorkflowsSection {...workflowProps} showHeader={false} />
          </div>
        )}
      </div>
      <div className="border-t border-gray-700/60 p-1.5 flex justify-center">
        <button
          onClick={() => setCollapsed(true)}
          className="text-gray-500 hover:text-gray-300 text-[11px] transition-colors flex items-center gap-1 px-2 py-0.5 rounded hover:bg-gray-800"
          title="Collapse palette"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
            <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 010 1.06L8.06 10l3.72 3.72a.75.75 0 11-1.06 1.06l-4.25-4.25a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 0z" clipRule="evenodd" />
          </svg>
          Hide
        </button>
      </div>
    </div>
  );
}

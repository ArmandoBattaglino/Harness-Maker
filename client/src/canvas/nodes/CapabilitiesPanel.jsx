import { useState, useCallback, useMemo } from 'react';
import { useSwarmStore } from '../../store/SwarmContext.jsx';

const KNOWN_TOOLS = [
  // File
  { name: 'Bash', description: 'Execute shell commands', category: 'File', defaultEnabled: true },
  { name: 'Read', description: 'Read file contents', category: 'File', defaultEnabled: true },
  { name: 'Edit', description: 'Edit files with diffs', category: 'File', defaultEnabled: true },
  { name: 'Write', description: 'Write new files', category: 'File', defaultEnabled: true },
  { name: 'Grep', description: 'Search file contents', category: 'File', defaultEnabled: true },
  { name: 'Glob', description: 'Find files by pattern', category: 'File', defaultEnabled: true },
  { name: 'LS', description: 'List directory contents', category: 'File', defaultEnabled: true },
  // Web
  { name: 'WebFetch', description: 'Fetch web page content', category: 'Web', defaultEnabled: false },
  { name: 'WebSearch', description: 'Search the web', category: 'Web', defaultEnabled: false },
  // Notebook
  { name: 'NotebookRead', description: 'Read Jupyter notebooks', category: 'Notebook', defaultEnabled: false },
  { name: 'NotebookEdit', description: 'Edit notebook cells', category: 'Notebook', defaultEnabled: false },
  // Task
  { name: 'TodoRead', description: 'Read task list', category: 'Task', defaultEnabled: false },
  { name: 'TodoWrite', description: 'Write task items', category: 'Task', defaultEnabled: false },
  // Meta
  { name: 'Agent', description: 'Spawn sub-agents', category: 'Meta', defaultEnabled: false },
  { name: 'AskUser', description: 'Ask the user a question', category: 'Meta', defaultEnabled: false },
  { name: 'Think', description: 'Extended thinking', category: 'Meta', defaultEnabled: false },
];

const TOOL_CATEGORIES = ['File', 'Web', 'Notebook', 'Task', 'Meta'];
const DEFAULT_TOOLS = KNOWN_TOOLS.filter((t) => t.defaultEnabled).map((t) => t.name);

function getProviderFromModel(model) {
  if (!model) return 'claude';
  const m = model.toLowerCase();
  if (m.includes('codex') || m.includes('gpt')) return 'codex';
  if (m.includes('gemini')) return 'gemini';
  return 'claude';
}

export default function CapabilitiesPanel({ nodeId, nodeData, onUpdateNode, onClose }) {
  const [customToolInput, setCustomToolInput] = useState('');
  const [customSkillInput, setCustomSkillInput] = useState('');
  const [contextInput, setContextInput] = useState('');

  const provider = getProviderFromModel(nodeData?.model);
  const toolsDisabled = provider !== 'claude';

  const selectedTools = useMemo(
    () => Array.isArray(nodeData?.tools) ? nodeData.tools : DEFAULT_TOOLS,
    [nodeData?.tools]
  );
  const skillHints = useMemo(
    () => Array.isArray(nodeData?.skillHints) ? nodeData.skillHints : [],
    [nodeData?.skillHints]
  );
  const contextSources = useMemo(
    () => Array.isArray(nodeData?.contextSources) ? nodeData.contextSources : [],
    [nodeData?.contextSources]
  );

  const toggleTool = useCallback((toolName) => {
    const next = selectedTools.includes(toolName)
      ? selectedTools.filter((t) => t !== toolName)
      : [...selectedTools, toolName];
    onUpdateNode(nodeId, { tools: next });
  }, [selectedTools, nodeId, onUpdateNode]);

  const addCustomTool = useCallback(() => {
    const name = customToolInput.trim();
    if (name && !selectedTools.includes(name)) {
      onUpdateNode(nodeId, { tools: [...selectedTools, name] });
      setCustomToolInput('');
    }
  }, [customToolInput, selectedTools, nodeId, onUpdateNode]);

  const removeCustomTool = useCallback((name) => {
    onUpdateNode(nodeId, { tools: selectedTools.filter((t) => t !== name) });
  }, [selectedTools, nodeId, onUpdateNode]);

  const addSkill = useCallback(() => {
    const name = customSkillInput.trim();
    if (name && !skillHints.includes(name)) {
      onUpdateNode(nodeId, { skillHints: [...skillHints, name] });
      setCustomSkillInput('');
    }
  }, [customSkillInput, skillHints, nodeId, onUpdateNode]);

  const removeSkill = useCallback((name) => {
    onUpdateNode(nodeId, { skillHints: skillHints.filter((s) => s !== name) });
  }, [skillHints, nodeId, onUpdateNode]);

  const addContextSource = useCallback(() => {
    const src = contextInput.trim();
    if (src && !contextSources.includes(src)) {
      onUpdateNode(nodeId, { contextSources: [...contextSources, src] });
      setContextInput('');
    }
  }, [contextInput, contextSources, nodeId, onUpdateNode]);

  const removeContextSource = useCallback((src) => {
    onUpdateNode(nodeId, { contextSources: contextSources.filter((s) => s !== src) });
  }, [contextSources, nodeId, onUpdateNode]);

  const customTools = selectedTools.filter((t) => !KNOWN_TOOLS.find((k) => k.name === t));

  // Preview text
  const previewLines = [];
  if (selectedTools.length > 0 && !toolsDisabled) {
    previewLines.push(`Tool boundary: ${selectedTools.join(', ')}`);
  }
  if (skillHints.length > 0) {
    previewLines.push(`Preferred skills: ${skillHints.join(', ')}`);
  }
  if (nodeData?.expectedOutput?.trim()) {
    previewLines.push(`Expected output: ${nodeData.expectedOutput.trim()}`);
  }

  return (
    <div className="absolute right-[calc(100%+12px)] top-0 z-50 w-80 rounded-lg border border-teal-700/60 bg-gray-900 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-700 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-teal-300">{nodeData?.label || 'Agent'}</span>
          <span className="rounded bg-gray-700 px-1.5 py-0.5 text-[9px] font-medium text-gray-300 uppercase">
            {provider}
          </span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">&times;</button>
      </div>

      {/* Body */}
      <div className="max-h-[420px] overflow-y-auto p-3 space-y-3">
        {/* Tools Section */}
        <details open className="group">
          <summary className="cursor-pointer text-xs font-semibold text-gray-300 select-none">
            Tools ({selectedTools.length})
          </summary>
          <div className="mt-2 space-y-2">
            {toolsDisabled && (
              <div className="rounded bg-yellow-900/30 border border-yellow-700/40 px-2 py-1 text-[10px] text-yellow-300">
                Tools not supported for {provider}
              </div>
            )}
            {TOOL_CATEGORIES.map((cat) => {
              const catTools = KNOWN_TOOLS.filter((t) => t.category === cat);
              return (
                <div key={cat}>
                  <div className="text-[10px] font-medium text-gray-500 uppercase mb-1">{cat}</div>
                  <div className="grid grid-cols-2 gap-1">
                    {catTools.map((tool) => (
                      <label key={tool.name} className="flex items-start gap-1.5 text-[10px] text-gray-300" title={tool.description}>
                        <input
                          type="checkbox"
                          checked={selectedTools.includes(tool.name)}
                          onChange={() => toggleTool(tool.name)}
                          disabled={toolsDisabled}
                          className="accent-teal-500 mt-0.5"
                        />
                        <span>{tool.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
            {/* Custom tools */}
            {customTools.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {customTools.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded bg-teal-900/40 px-1.5 py-0.5 text-[10px] text-teal-300">
                    {t}
                    <button onClick={() => removeCustomTool(t)} className="text-teal-500 hover:text-red-400">&times;</button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-1">
              <input
                className="flex-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[10px] text-gray-200"
                value={customToolInput}
                onChange={(e) => setCustomToolInput(e.target.value)}
                placeholder="Custom tool name..."
                onKeyDown={(e) => e.key === 'Enter' && addCustomTool()}
                disabled={toolsDisabled}
              />
              <button
                onClick={addCustomTool}
                disabled={toolsDisabled}
                className="rounded bg-teal-800 px-2 py-1 text-[10px] text-teal-200 hover:bg-teal-700 disabled:opacity-40"
              >+</button>
            </div>
          </div>
        </details>

        {/* Skills Section */}
        <details open className="group">
          <summary className="cursor-pointer text-xs font-semibold text-gray-300 select-none">
            Skills ({skillHints.length})
          </summary>
          <div className="mt-2 space-y-1">
            {skillHints.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {skillHints.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 rounded bg-purple-900/40 px-1.5 py-0.5 text-[10px] text-purple-300">
                    {s}
                    <button onClick={() => removeSkill(s)} className="text-purple-500 hover:text-red-400">&times;</button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-1">
              <input
                className="flex-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[10px] text-gray-200"
                value={customSkillInput}
                onChange={(e) => setCustomSkillInput(e.target.value)}
                placeholder="Skill name..."
                onKeyDown={(e) => e.key === 'Enter' && addSkill()}
              />
              <button onClick={addSkill} className="rounded bg-purple-800 px-2 py-1 text-[10px] text-purple-200 hover:bg-purple-700">+</button>
            </div>
          </div>
        </details>

        {/* Context & Output Section */}
        <details className="group">
          <summary className="cursor-pointer text-xs font-semibold text-gray-300 select-none">
            Context & Output
          </summary>
          <div className="mt-2 space-y-2">
            <div>
              <div className="text-[10px] text-gray-400 mb-1">Context Sources</div>
              {contextSources.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1">
                  {contextSources.map((src) => (
                    <span key={src} className="inline-flex items-center gap-1 rounded bg-cyan-900/40 px-1.5 py-0.5 text-[10px] text-cyan-300">
                      {src}
                      <button onClick={() => removeContextSource(src)} className="text-cyan-500 hover:text-red-400">&times;</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-1">
                <input
                  className="flex-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[10px] text-gray-200"
                  value={contextInput}
                  onChange={(e) => setContextInput(e.target.value)}
                  placeholder="Source path or URL..."
                  onKeyDown={(e) => e.key === 'Enter' && addContextSource()}
                />
                <button onClick={addContextSource} className="rounded bg-cyan-800 px-2 py-1 text-[10px] text-cyan-200 hover:bg-cyan-700">+</button>
              </div>
            </div>
            <div>
              <div className="text-[10px] text-gray-400 mb-1">Expected Output</div>
              <textarea
                className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[10px] text-gray-200 resize-y"
                rows={2}
                value={nodeData?.expectedOutput || ''}
                onChange={(e) => onUpdateNode(nodeId, { expectedOutput: e.target.value })}
                placeholder="Describe expected output..."
              />
            </div>
            <div>
              <div className="text-[10px] text-gray-400 mb-1">Output Format</div>
              <select
                className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[10px] text-gray-200"
                value={nodeData?.expectedOutputContract?.format || 'markdown'}
                onChange={(e) => onUpdateNode(nodeId, {
                  expectedOutputContract: { ...(nodeData?.expectedOutputContract || {}), format: e.target.value },
                })}
              >
                <option value="markdown">Markdown</option>
                <option value="json">JSON</option>
                <option value="text">Plain Text</option>
                <option value="table">Table</option>
              </select>
            </div>
          </div>
        </details>
      </div>

      {/* Footer — Preview */}
      {previewLines.length > 0 && (
        <div className="border-t border-gray-700 px-3 py-2">
          <div className="text-[9px] text-gray-500 uppercase mb-1">Guidance Preview</div>
          {previewLines.map((line, i) => (
            <div key={i} className="text-[10px] text-teal-300/80 truncate">{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}

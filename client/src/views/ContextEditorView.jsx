import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPut } from '../hooks/useApi.js';
import { useAppState } from '../store/AppContext.jsx';

const LINE_WARN_THRESHOLD = 80;
const LINE_LIMIT = 100;

// ---------------------------------------------------------------------------
// Rule parsing helpers
// ---------------------------------------------------------------------------

function parseRules(content) {
  if (!content || !content.trim()) return [];
  const sections = content.split(/^## /m).filter(Boolean);
  return sections.map((section) => {
    const lines = section.split('\n');
    const name = lines[0].trim();
    const body = lines.slice(1).join('\n').trim();
    return { name, body };
  });
}

function rulesToContent(rules) {
  return rules.map((r) => `## ${r.name}\n\n${r.body}`).join('\n\n');
}

// ---------------------------------------------------------------------------
// Syntax-highlighted line renderer for right pane
// ---------------------------------------------------------------------------

function renderHighlightedLine(line, idx) {
  if (line.startsWith('## ') || line.startsWith('# ')) {
    return (
      <span key={idx} className="text-primary font-semibold">
        {line}
      </span>
    );
  }
  if (line.startsWith('### ') || line.startsWith('#### ')) {
    return (
      <span key={idx} className="text-primary">
        {line}
      </span>
    );
  }

  // Inline code highlighting
  const parts = line.split(/(`[^`]+`)/g);
  if (parts.length > 1) {
    return (
      <span key={idx}>
        {parts.map((part, pi) =>
          part.startsWith('`') && part.endsWith('`') ? (
            <span key={pi} className="text-accent">
              {part}
            </span>
          ) : (
            <span key={pi} className="text-text-main">
              {part}
            </span>
          )
        )}
      </span>
    );
  }

  return (
    <span key={idx} className="text-text-main">
      {line}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  const colors =
    type === 'error'
      ? 'bg-error/15 border-error/40 text-error'
      : 'bg-success/15 border-success/40 text-success';

  return (
    <div
      className={`fixed bottom-6 right-6 px-4 py-3 rounded text-xs font-semibold z-50 border ${colors}`}
    >
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rule Block
// ---------------------------------------------------------------------------

function RuleBlock({ rule, index, onChangeName, onChangeBody, onDelete }) {
  return (
    <div className="group bg-[#0f0f0f] border border-border-color rounded-lg p-4 hover:border-[#333333] transition-all">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[#333333] cursor-grab text-[20px]">
            drag_indicator
          </span>
          <input
            className="bg-transparent border-none text-white font-bold focus:ring-0 p-0 text-sm w-48 placeholder-[#333333] outline-none"
            type="text"
            value={rule.name}
            onChange={(e) => onChangeName(index, e.target.value)}
            placeholder="Rule name..."
          />
        </div>
        <button
          onClick={() => onDelete(index)}
          className="text-[#333333] hover:text-error transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
      <textarea
        className="w-full bg-[#050505] border border-border-color rounded-md p-4 text-sm text-[#cccccc] font-mono leading-relaxed focus:border-primary/50 focus:ring-0 outline-none resize-none min-h-[100px]"
        value={rule.body}
        onChange={(e) => onChangeBody(index, e.target.value)}
        spellCheck={false}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main View
// ---------------------------------------------------------------------------

export default function ContextEditorView() {
  const { activeProjectId, projects } = useAppState();

  const [scope, setScope] = useState('project');
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Derived
  const lineCount = content ? content.split('\n').length : 0;
  const showWarning = lineCount > LINE_WARN_THRESHOLD;
  const hasChanges = content !== originalContent;

  // ---- Load content ----
  const loadContent = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const url = activeProjectId
        ? `/api/v1/claudemd?projectId=${encodeURIComponent(activeProjectId)}`
        : '/api/v1/claudemd';
      const data = await apiGet(url);

      let loaded = '';
      if (scope === 'project') {
        loaded = data.projectScope?.content ?? '';
      } else {
        loaded = data.userScope?.content ?? '';
      }
      setContent(loaded);
      setOriginalContent(loaded);
      setRules(parseRules(loaded));
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeProjectId, scope]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  // ---- Sync rules -> content ----
  const syncContentFromRules = useCallback((updatedRules) => {
    setRules(updatedRules);
    setContent(rulesToContent(updatedRules));
  }, []);

  // ---- Rule handlers ----
  const handleRuleNameChange = useCallback(
    (index, newName) => {
      const updated = rules.map((r, i) =>
        i === index ? { ...r, name: newName } : r
      );
      syncContentFromRules(updated);
    },
    [rules, syncContentFromRules]
  );

  const handleRuleBodyChange = useCallback(
    (index, newBody) => {
      const updated = rules.map((r, i) =>
        i === index ? { ...r, body: newBody } : r
      );
      syncContentFromRules(updated);
    },
    [rules, syncContentFromRules]
  );

  const handleDeleteRule = useCallback(
    (index) => {
      const updated = rules.filter((_, i) => i !== index);
      syncContentFromRules(updated);
    },
    [rules, syncContentFromRules]
  );

  const handleAddRule = useCallback(() => {
    const updated = [...rules, { name: 'New Rule', body: '' }];
    syncContentFromRules(updated);
  }, [rules, syncContentFromRules]);

  // ---- Save ----
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      if (scope === 'project') {
        await apiPut('/api/v1/claudemd/project', {
          content,
          projectId: activeProjectId,
        });
      } else {
        await apiPut('/api/v1/claudemd/user', { content });
      }
      setOriginalContent(content);
      setToast({ message: 'Changes pushed successfully.', type: 'success' });
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  }, [scope, content, activeProjectId]);

  // ---- Discard ----
  const handleDiscard = useCallback(() => {
    setContent(originalContent);
    setRules(parseRules(originalContent));
  }, [originalContent]);

  // ---- Copy ----
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setToast({ message: 'Copied to clipboard.', type: 'success' });
    });
  }, [content]);

  // ---- Scope switch with unsaved-changes guard (BUG-09 fix) ----
  const handleScopeSwitch = useCallback((newScope) => {
    if (newScope === scope) return;
    if (hasChanges) {
      const confirmed = window.confirm(
        'You have unsaved changes. Discard them and switch tabs?'
      );
      if (!confirmed) return;
    }
    setScope(newScope);
  }, [scope, hasChanges]);

  // ---- Empty state: project scope with no project ----
  if (scope === 'project' && !activeProjectId && !loading) {
    return (
      <div className="flex flex-col flex-1 min-w-0 bg-black">
        {/* Header */}
        <Header
          scope={scope}
          onScopeChange={handleScopeSwitch}
          hasChanges={false}
          saving={false}
          onSave={handleSave}
          onDiscard={handleDiscard}
        />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <span className="material-symbols-outlined text-[48px] text-[#333333] mb-4 block">
              folder_off
            </span>
            <p className="text-sm text-text-muted">
              Select a project to edit its CLAUDE.md rules
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="flex flex-col flex-1 min-w-0 bg-black">
        <Header
          scope={scope}
          onScopeChange={handleScopeSwitch}
          hasChanges={false}
          saving={false}
          onSave={handleSave}
          onDiscard={handleDiscard}
        />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xs text-text-muted animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  // ---- Error state ----
  if (loadError) {
    return (
      <div className="flex flex-col flex-1 min-w-0 bg-black">
        <Header
          scope={scope}
          onScopeChange={handleScopeSwitch}
          hasChanges={false}
          saving={false}
          onSave={handleSave}
          onDiscard={handleDiscard}
        />
        <div className="flex flex-1 items-center justify-center">
          <div className="bg-error/10 border border-error/30 rounded-lg px-4 py-3 text-xs text-error max-w-md">
            {loadError}
          </div>
        </div>
      </div>
    );
  }

  const contentLines = content.split('\n');

  return (
    <div className="flex flex-col flex-1 min-w-0 bg-black">
      {/* Header */}
      <Header
        scope={scope}
        onScopeChange={handleScopeSwitch}
        hasChanges={hasChanges}
        saving={saving}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />

      {/* Warning Banner */}
      {showWarning && (
        <div className="bg-[#221100] border-b border-[#442200] px-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3 text-[#ffaa44]">
            <span className="material-symbols-outlined text-[18px]">
              warning
            </span>
            <p className="text-xs font-medium">
              Context budget warning: CLAUDE.md is approaching {LINE_LIMIT}{' '}
              lines. Large instruction sets may degrade model reasoning
              performance.
            </p>
          </div>
          <div className="text-[10px] font-mono text-[#ffaa44]/60 uppercase">
            {lineCount} / {LINE_LIMIT} Lines
          </div>
        </div>
      )}

      {/* Two-column workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Rule Explorer */}
        <section className="w-1/2 border-r border-border-color flex flex-col bg-[#050505]">
          <div className="px-6 py-3 border-b border-border-color flex items-center justify-between bg-[#090909]">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-text-muted uppercase tracking-widest">
                Rule Explorer
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[10px] font-mono text-[#444444]">
                {rules.length} ACTIVE BLOCK{rules.length !== 1 ? 'S' : ''}
              </span>
              <button className="text-primary hover:text-white transition-colors">
                <span className="material-symbols-outlined text-[18px]">
                  sort
                </span>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {rules.map((rule, i) => (
              <RuleBlock
                key={i}
                rule={rule}
                index={i}
                onChangeName={handleRuleNameChange}
                onChangeBody={handleRuleBodyChange}
                onDelete={handleDeleteRule}
              />
            ))}

            {/* Add Rule CTA */}
            <button
              onClick={handleAddRule}
              className="w-full border border-dashed border-border-color rounded-lg py-8 flex flex-col items-center justify-center gap-3 text-[#444444] hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-all group"
            >
              <span className="material-symbols-outlined text-[32px] group-hover:scale-110 transition-transform">
                add_circle
              </span>
              <span className="text-xs font-bold uppercase tracking-[0.2em]">
                Add Context Rule
              </span>
            </button>
          </div>
        </section>

        {/* Right: CLAUDE.md Output */}
        <section className="w-1/2 bg-black flex flex-col">
          <div className="px-6 py-3 border-b border-border-color flex items-center justify-between bg-black">
            <span className="text-[11px] font-bold text-text-muted uppercase tracking-widest">
              CLAUDE.md Output
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="p-1.5 rounded hover:bg-surface-hover text-[#666666] hover:text-white transition-all"
              >
                <span className="material-symbols-outlined text-[18px]">
                  content_copy
                </span>
              </button>
              <button className="p-1.5 rounded hover:bg-surface-hover text-[#666666] hover:text-white transition-all">
                <span className="material-symbols-outlined text-[18px]">
                  open_in_full
                </span>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 font-mono text-[13px] leading-[1.6]">
            <div className="flex">
              {/* Line numbers */}
              <div className="pr-4 text-right select-none text-[#333333] text-[12px] leading-[1.6] flex-shrink-0">
                {contentLines.map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
              {/* Content */}
              <div className="flex-1 min-w-0">
                {contentLines.map((line, i) => (
                  <div key={i} className="whitespace-pre-wrap break-words">
                    {line === '' ? '\u00A0' : renderHighlightedLine(line, i)}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer Stats */}
          <div className="px-6 py-2 border-t border-border-color flex items-center justify-between text-[10px] font-mono text-[#444444]">
            <div className="flex gap-4">
              <span>UTF-8</span>
              <span>MARKDOWN</span>
            </div>
            <div className="flex gap-4">
              <span>LINES: {lineCount}</span>
            </div>
          </div>
        </section>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header sub-component
// ---------------------------------------------------------------------------

function Header({ scope, onScopeChange, hasChanges, saving, onSave, onDiscard }) {
  return (
    <header className="h-14 border-b border-white/[0.06] bg-black/60 backdrop-blur-md flex items-center justify-between px-6 z-10 flex-shrink-0">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary">
            auto_fix_high
          </span>
          <h2 className="text-white text-sm font-semibold tracking-tight">
            CLAUDE.md Rules
          </h2>
        </div>
        <nav className="flex items-center gap-1 bg-[#0f0f0f] p-1 rounded-lg border border-border-color">
          <button
            onClick={() => onScopeChange('project')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              scope === 'project'
                ? 'bg-surface-hover text-text-main'
                : 'text-text-muted hover:text-[#cccccc]'
            }`}
          >
            Project Rules
          </button>
          <button
            onClick={() => onScopeChange('user')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              scope === 'user'
                ? 'bg-surface-hover text-text-main'
                : 'text-text-muted hover:text-[#cccccc]'
            }`}
          >
            User Global
          </button>
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-[#0f0f0f] border border-border-color">
          <span className="w-1 h-1 rounded-full bg-primary animate-pulse"></span>
          <span className="text-[10px] text-text-muted font-mono uppercase tracking-tighter">
            Live Sync
          </span>
        </div>
        <div className="h-4 w-px bg-border-color"></div>
        <div className="flex items-center gap-2">
          <button
            onClick={onDiscard}
            disabled={!hasChanges}
            className={`h-8 px-4 text-xs font-medium transition-colors ${
              hasChanges
                ? 'text-text-muted hover:text-white'
                : 'text-[#333333] cursor-not-allowed'
            }`}
          >
            Discard
          </button>
          <button
            onClick={onSave}
            disabled={saving || !hasChanges}
            className={`h-8 px-4 rounded-md text-xs font-bold transition-colors ${
              saving || !hasChanges
                ? 'bg-[#333333] text-[#666666] cursor-not-allowed'
                : 'bg-white text-black hover:bg-gray-200'
            }`}
          >
            {saving ? 'Pushing...' : 'Push Changes'}
          </button>
        </div>
      </div>
    </header>
  );
}

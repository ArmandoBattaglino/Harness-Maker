// DeploymentManagerView.jsx — Deployment Manager (Phase 9 redesign)
// Master-detail layout: Profiles | Active Processes | Environment tabs

import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiPut, apiDeleteWithBody } from '../hooks/useApi.js';
import { useAppState } from '../store/AppContext.jsx';

const MODEL_OPTIONS = [
  { value: '', label: 'Default' },
  { value: 'claude-opus-4-6', label: 'claude-opus-4-6' },
  { value: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6' },
  { value: 'claude-haiku-4-5-20251001', label: 'claude-haiku-4-5-20251001' },
];

const TABS = [
  { id: 'profiles', label: 'Profiles' },
  { id: 'processes', label: 'Active Processes' },
  { id: 'environment', label: 'Environment' },
];

/* ── Toast ─────────────────────────────────────────── */

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  const cls = type === 'error'
    ? 'bg-error/15 border-error/40 text-error'
    : 'bg-success/15 border-success/40 text-success';

  return (
    <div className={`fixed bottom-6 right-6 px-4 py-3 rounded text-xs font-semibold z-50 border ${cls}`}>
      {message}
    </div>
  );
}

/* ── Agent Card in master list ─────────────────────── */

function AgentCard({ agent, isSelected, onClick }) {
  const isRunning = false; // Future: check active sessions

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-md flex items-start gap-3 relative overflow-hidden transition-colors border ${
        isSelected
          ? 'bg-surface-default border-border-color'
          : 'border-transparent hover:bg-surface-hover hover:border-border-color'
      }`}
    >
      {isRunning && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-success" />
      )}
      <div className={`mt-0.5 ${isRunning ? 'text-primary' : 'text-text-muted'}`}>
        <span className="material-symbols-outlined text-[18px]">smart_toy</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center mb-1">
          <h3 className="text-sm font-medium text-text-main truncate">{agent.name}</h3>
          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase ${
            isRunning
              ? 'text-success bg-success/10 border-success/20'
              : 'text-text-muted bg-surface border-border-color'
          }`}>
            {isRunning ? 'Running' : 'Idle'}
          </span>
        </div>
        <p className="text-xs text-text-muted truncate">
          {agent.description || 'No description'}
        </p>
      </div>
    </button>
  );
}

/* ── Skill Card ────────────────────────────────────── */

function SkillCard({ skill, isSelected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-md flex items-start gap-3 transition-colors border ${
        isSelected
          ? 'bg-surface-default border-border-color'
          : 'border-transparent hover:bg-surface-hover hover:border-border-color'
      }`}
    >
      <div className="mt-0.5 text-text-muted">
        <span className="material-symbols-outlined text-[18px]">extension</span>
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium text-text-main truncate">{skill.name}</h3>
        <p className="text-xs text-text-muted truncate">{skill.description || 'No description'}</p>
      </div>
    </button>
  );
}

/* ── Create Agent Modal ────────────────────────────── */

function CreateAgentModal({ activeProjectId, onCreated, onClose }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState('project');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    if (!/^[a-z][a-z0-9-]*$/.test(name.trim())) { setError('Name must match ^[a-z][a-z0-9-]*$'); return; }

    setSaving(true);
    setError(null);
    try {
      await apiPost('/api/v1/agents', {
        name: name.trim(),
        scope,
        projectId: activeProjectId,
        frontmatter: { name: name.trim(), description: description.trim() },
        body: '',
      });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <form onSubmit={handleCreate} className="w-full max-w-[420px] rounded-xl border border-border-default bg-surface-default p-6">
        <h2 className="mb-4 text-sm font-semibold text-text-main">Register Agent</h2>

        {error && (
          <div className="mb-3 px-3 py-2 rounded text-xs bg-error/10 border border-error/30 text-error">{error}</div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-bold text-text-muted uppercase tracking-tight mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-10 bg-surface border border-border-default rounded px-3 text-sm text-text-main font-mono focus:outline-none focus:border-primary"
              placeholder="my-agent"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-text-muted uppercase tracking-tight mb-1">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full h-10 bg-surface border border-border-default rounded px-3 text-sm text-text-main focus:outline-none focus:border-primary"
              placeholder="What this agent does"
            />
          </div>
          <div className="flex gap-4 text-xs text-text-muted">
            {['project', 'user'].map((s) => (
              <label key={s} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="scope" value={s} checked={scope === s} onChange={() => setScope(s)} className="accent-primary" />
                {s === 'project' ? 'Project' : 'User (global)'}
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-5">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs text-text-muted hover:text-text-main border border-border-default rounded-lg">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-xs font-bold text-white bg-primary rounded-lg hover:brightness-110 disabled:opacity-50">
            {saving ? 'Creating...' : 'Register'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Agent Detail Form ─────────────────────────────── */

function AgentDetail({ agent, activeProjectId, onSaved, onDeleted }) {
  const [description, setDescription] = useState('');
  const [model, setModel] = useState('');
  const [tools, setTools] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!agent) return;
    setDescription(agent.description || '');
    setModel(agent.model || '');
    setTools(agent.tools || '');
    setBody(agent.body || '');
  }, [agent]);

  if (!agent) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <span className="material-symbols-outlined text-[48px] text-text-dimmer mb-4 block">smart_toy</span>
          <p className="text-sm text-text-muted">Select an agent to view configuration</p>
        </div>
      </div>
    );
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await apiPut(`/api/v1/agents/${agent.id || agent.name}`, {
        frontmatter: {
          name: agent.name,
          description: description.trim(),
          ...(model ? { model } : {}),
          ...(tools ? { tools: tools.trim() } : {}),
        },
        body,
        filePath: agent.filePath,
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete agent "${agent.name}"?`)) return;
    try {
      await apiDeleteWithBody(`/api/v1/agents/${agent.id || agent.name}`, {
        filePath: agent.filePath,
        projectId: activeProjectId,
      });
      onDeleted();
    } catch (err) {
      setError(err.message);
    }
  }

  const toolList = tools ? tools.split(',').map((t) => t.trim()).filter(Boolean) : [];

  return (
    <div className="flex-1 flex flex-col bg-background-dark relative min-w-0">
      {/* Detail Header */}
      <div className="h-16 border-b border-border-color flex items-center justify-between px-8 shrink-0 bg-surface/30">
        <div className="flex items-center gap-4">
          <div className="size-10 rounded bg-primary/10 flex items-center justify-center border border-primary/20">
            <span className="material-symbols-outlined text-primary">smart_toy</span>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-main">Deployment: {agent.name}</h2>
            <p className="text-xs text-text-muted font-mono mt-0.5">
              {agent.scope === 'user' ? 'User scope' : 'Project scope'} {agent.filePath ? `@ ${agent.filePath}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDelete}
            className="text-text-muted hover:text-error transition-colors p-2 rounded-md hover:bg-surface border border-transparent hover:border-border-color"
            title="Delete Agent"
          >
            <span className="material-symbols-outlined text-[20px]">delete</span>
          </button>
        </div>
      </div>

      {/* Scrollable Configuration */}
      <div className="flex-1 overflow-y-auto p-8">
        {error && (
          <div className="mb-6 px-4 py-2 rounded text-xs bg-error/10 border border-error/30 text-error">{error}</div>
        )}

        <div className="max-w-4xl space-y-12 pb-24">
          {/* Profile Configuration */}
          <FormSection title="Profile Configuration">
            <div className="grid grid-cols-2 gap-8">
              <FormField label="Profile Identifier">
                <input
                  type="text"
                  value={agent.name}
                  readOnly
                  className="w-full h-10 bg-surface border border-border-default rounded px-3 text-sm text-text-muted font-mono cursor-not-allowed"
                />
              </FormField>
              <FormField label="Description">
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full h-10 bg-surface border border-border-default rounded px-3 text-sm text-text-main font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                />
              </FormField>
            </div>
          </FormSection>

          {/* Model Intelligence */}
          <FormSection title="Model Intelligence">
            <div className="grid grid-cols-2 gap-8">
              <FormField label="Base Model">
                <div className="relative">
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full h-10 bg-surface border border-border-default rounded pl-3 pr-10 text-sm text-text-main appearance-none focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono"
                  >
                    {MODEL_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none text-[20px]">
                    expand_more
                  </span>
                </div>
              </FormField>
            </div>

            <div className="mt-6">
              <FormField label="Core Directives">
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full bg-surface border border-border-default rounded p-4 text-sm text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono resize-y leading-relaxed min-h-[160px]"
                  spellCheck={false}
                  placeholder="Agent system prompt / body content..."
                />
              </FormField>
            </div>
          </FormSection>

          {/* Module Hooks */}
          <FormSection title="Module Hooks">
            <div className="flex flex-wrap gap-2 mb-4">
              {toolList.length === 0 && (
                <span className="text-xs text-text-muted italic">No tools configured</span>
              )}
              {toolList.map((tool, i) => (
                <div key={i} className="flex items-center gap-2 bg-surface border border-border-default rounded pl-3 pr-1 py-1.5">
                  <span className="material-symbols-outlined text-[16px] text-text-muted">extension</span>
                  <span className="text-[11px] font-mono font-medium text-text-main">{tool}</span>
                  <button
                    onClick={() => {
                      const newTools = toolList.filter((_, j) => j !== i).join(',');
                      setTools(newTools);
                    }}
                    className="text-text-muted hover:text-error rounded-full p-0.5 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </div>
              ))}
            </div>
            <div>
              <label className="block text-[11px] font-bold text-text-muted uppercase tracking-tight mb-1">Tools (comma-separated)</label>
              <input
                type="text"
                value={tools}
                onChange={(e) => setTools(e.target.value)}
                className="w-full h-10 bg-surface border border-border-default rounded px-3 text-sm text-text-main font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                placeholder="Read,Write,Bash,Glob"
              />
            </div>
          </FormSection>
        </div>
      </div>

      {/* Sticky Action Bar */}
      <div className="absolute bottom-0 right-0 left-0 p-4 border-t border-border-color bg-background-dark/95 backdrop-blur-md flex justify-end gap-3 z-10">
        <button
          onClick={() => {
            setDescription(agent.description || '');
            setModel(agent.model || '');
            setTools(agent.tools || '');
            setBody(agent.body || '');
          }}
          className="px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-text-muted bg-transparent border border-border-default rounded hover:bg-surface hover:text-text-main transition-colors"
        >
          Revert
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-7 py-2.5 text-[11px] font-bold uppercase tracking-wider text-white bg-primary rounded hover:brightness-110 transition-all flex items-center gap-2 disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>save</span>
          {saving ? 'Saving...' : 'Commit Changes'}
        </button>
      </div>
    </div>
  );
}

/* ── Form helpers ──────────────────────────────────── */

function FormSection({ title, children }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em]">{title}</h3>
        <div className="h-px grow bg-border-default" />
      </div>
      {children}
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <div className="space-y-2">
      <label className="block text-[11px] font-bold text-text-muted uppercase tracking-tight">{label}</label>
      {children}
    </div>
  );
}

/* ── Active Processes Tab (stub) ───────────────────── */

function ActiveProcessesTab() {
  const { sessions, projects } = useAppState();
  const entries = Object.entries(sessions);

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <span className="material-symbols-outlined text-[48px] text-text-dimmer mb-4 block">monitor_heart</span>
          <p className="text-sm text-text-muted">No active processes</p>
          <p className="text-xs text-text-dim mt-1">Start a terminal session to see running processes here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl space-y-2">
        {entries.map(([projectId, session]) => {
          const project = projects.find((p) => p.id === projectId);
          return (
            <div key={projectId} className="flex items-center gap-4 p-4 bg-surface-default border border-border-color rounded-lg">
              <div className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-main">{project?.name || projectId}</p>
                <p className="text-xs text-text-muted font-mono">PID: {session.pid || '—'} | Session: {session.sessionId?.slice(0, 8) || '—'}</p>
              </div>
              <span className="text-[9px] font-mono text-success bg-success/10 px-1.5 py-0.5 rounded border border-success/20 uppercase">
                Active
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main Component ────────────────────────────────── */

export default function DeploymentManagerView() {
  const { activeProjectId } = useAppState();

  const [activeTab, setActiveTab] = useState('profiles');
  const [agents, setAgents] = useState([]);
  const [skills, setSkills] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [toast, setToast] = useState(null);

  /* ── Load data ──────────────────────────────────── */
  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      const url = activeProjectId
        ? `/api/v1/agents?projectId=${encodeURIComponent(activeProjectId)}`
        : '/api/v1/agents';
      const data = await apiGet(url);
      setAgents(data.agents ?? []);
    } catch {
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, [activeProjectId]);

  const loadSkills = useCallback(async () => {
    try {
      const url = activeProjectId
        ? `/api/v1/skills?projectId=${encodeURIComponent(activeProjectId)}`
        : '/api/v1/skills';
      const data = await apiGet(url);
      setSkills(data.skills ?? []);
    } catch {
      setSkills([]);
    }
  }, [activeProjectId]);

  useEffect(() => {
    loadAgents();
    loadSkills();
  }, [loadAgents, loadSkills]);

  /* ── Filter ─────────────────────────────────────── */
  const filteredAgents = agents.filter((a) =>
    a.name.toLowerCase().includes(searchFilter.toLowerCase())
  );
  const filteredSkills = skills.filter((s) =>
    s.name.toLowerCase().includes(searchFilter.toLowerCase())
  );

  /* ── No project state ───────────────────────────── */
  if (!activeProjectId) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden bg-background-dark">
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} onRegister={() => {}} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <span className="material-symbols-outlined text-[48px] text-text-dimmer mb-4 block">memory</span>
            <p className="text-sm text-text-muted">Select a project to manage deployments</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-background-dark">
      {/* Tab Bar */}
      <TabBar
        activeTab={activeTab}
        onTabChange={(tab) => { setActiveTab(tab); setSelectedAgent(null); setSelectedSkill(null); }}
        onRegister={() => setShowCreateModal(true)}
      />

      {/* Tab Content */}
      {activeTab === 'profiles' && (
        <div className="flex-1 flex min-h-0">
          {/* Master list */}
          <div className="w-[340px] border-r border-border-color bg-background-dark flex flex-col shrink-0">
            <div className="p-4 border-b border-border-color">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[16px]">search</span>
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full h-9 bg-surface border border-border-default rounded-md pl-9 pr-3 text-sm text-text-main placeholder-text-muted focus:outline-none focus:border-primary transition-all font-mono"
                  placeholder="Filter profiles..."
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {loading && <p className="px-3 py-4 text-xs text-text-muted animate-pulse">Loading...</p>}
              {!loading && filteredAgents.length === 0 && (
                <p className="px-3 py-4 text-xs text-text-muted italic">No agents found.</p>
              )}
              {filteredAgents.map((agent) => (
                <AgentCard
                  key={agent.name + (agent.filePath || '')}
                  agent={agent}
                  isSelected={selectedAgent?.name === agent.name && selectedAgent?.filePath === agent.filePath}
                  onClick={() => setSelectedAgent(agent)}
                />
              ))}
            </div>
          </div>

          {/* Detail pane */}
          <AgentDetail
            agent={selectedAgent}
            activeProjectId={activeProjectId}
            onSaved={() => { loadAgents(); setToast({ message: 'Agent saved.', type: 'success' }); }}
            onDeleted={() => { setSelectedAgent(null); loadAgents(); setToast({ message: 'Agent deleted.', type: 'success' }); }}
          />
        </div>
      )}

      {activeTab === 'processes' && <ActiveProcessesTab />}

      {activeTab === 'environment' && (
        <div className="flex-1 flex min-h-0">
          {/* Skills master list */}
          <div className="w-[340px] border-r border-border-color bg-background-dark flex flex-col shrink-0">
            <div className="p-4 border-b border-border-color">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[16px]">search</span>
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full h-9 bg-surface border border-border-default rounded-md pl-9 pr-3 text-sm text-text-main placeholder-text-muted focus:outline-none focus:border-primary transition-all font-mono"
                  placeholder="Filter skills..."
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredSkills.length === 0 && (
                <p className="px-3 py-4 text-xs text-text-muted italic">No skills found.</p>
              )}
              {filteredSkills.map((skill) => (
                <SkillCard
                  key={skill.name + (skill.filePath || '')}
                  skill={skill}
                  isSelected={selectedSkill?.name === skill.name}
                  onClick={() => setSelectedSkill(skill)}
                />
              ))}
            </div>
          </div>

          {/* Skill detail */}
          <div className="flex-1 flex flex-col bg-background-dark">
            {selectedSkill ? (
              <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-3xl">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="size-10 rounded bg-primary/10 flex items-center justify-center border border-primary/20">
                      <span className="material-symbols-outlined text-primary">extension</span>
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-text-main">{selectedSkill.name}</h2>
                      <p className="text-xs text-text-muted">{selectedSkill.description || 'No description'}</p>
                    </div>
                  </div>

                  <FormSection title="Skill Content">
                    <pre className="bg-surface border border-border-default rounded p-4 text-sm text-text-main font-mono whitespace-pre-wrap leading-relaxed overflow-y-auto max-h-[400px]">
                      {selectedSkill.content || selectedSkill.body || '(empty)'}
                    </pre>
                  </FormSection>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <span className="material-symbols-outlined text-[48px] text-text-dimmer mb-4 block">extension</span>
                  <p className="text-sm text-text-muted">Select a skill to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateAgentModal
          activeProjectId={activeProjectId}
          onCreated={() => { setShowCreateModal(false); loadAgents(); setToast({ message: 'Agent registered.', type: 'success' }); }}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

/* ── Tab Bar ───────────────────────────────────────── */

function TabBar({ activeTab, onTabChange, onRegister }) {
  return (
    <header className="h-[52px] border-b border-border-color flex items-end px-6 shrink-0 bg-background-dark">
      <div className="flex gap-8 h-full">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center justify-center h-full border-b-[2px] px-1 pb-[2px] transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-text-main'
                : 'border-transparent text-text-muted hover:text-text-main'
            }`}
          >
            <span className={`text-sm tracking-wide ${activeTab === tab.id ? 'font-semibold' : 'font-medium'}`}>
              {tab.label}
            </span>
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center h-full pb-2">
        <button
          onClick={onRegister}
          className="flex items-center gap-1.5 text-xs font-medium text-text-main bg-surface border border-border-default px-3 py-1.5 rounded-md hover:bg-surface-hover transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          Register Agent
        </button>
      </div>
    </header>
  );
}

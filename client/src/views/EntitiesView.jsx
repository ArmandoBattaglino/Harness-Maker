import { useState } from 'react';
import { useAppState } from '../store/AppContext.jsx';
import AgentEditor from '../components/AgentEditor.jsx';
import SkillEditor from '../components/SkillEditor.jsx';
import ClaudeMdEditor from '../components/ClaudeMdEditor.jsx';

const TABS = [
  { id: 'agents', label: 'Agents' },
  { id: 'skills', label: 'Skills' },
  { id: 'claudemd', label: 'CLAUDE.md' },
];

export default function EntitiesView() {
  const { activeProjectId } = useAppState();
  const [activeTab, setActiveTab] = useState('agents');

  return (
    <div className="flex flex-col flex-1 overflow-hidden" style={{ backgroundColor: '#111111' }}>
      {/* Tab bar */}
      <div
        className="flex gap-1 px-4 border-b"
        style={{ backgroundColor: '#1a1a1a', borderColor: '#1f2937', flexShrink: 0 }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-4 py-3 text-xs font-medium relative"
              style={{
                color: isActive ? '#4ade80' : '#6b7280',
                backgroundColor: 'transparent',
                borderBottom: isActive ? '2px solid #4ade80' : '2px solid transparent',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex flex-1 overflow-hidden">
        {activeTab === 'agents' && (
          <AgentEditor activeProjectId={activeProjectId} />
        )}
        {activeTab === 'skills' && (
          <SkillEditor activeProjectId={activeProjectId} />
        )}
        {activeTab === 'claudemd' && (
          <ClaudeMdEditor activeProjectId={activeProjectId} />
        )}
      </div>
    </div>
  );
}

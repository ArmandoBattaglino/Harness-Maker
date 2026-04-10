// client/src/panels/AgentOutputPanel.jsx
// Side panel showing clean semantic output of a specific agent node,
// its handoff data, and copy-to-clipboard functionality.
import { useState, useEffect, useMemo, useRef } from 'react';
import { useSwarmStore } from '../store/SwarmContext';
import { stripAnsi } from '../utils/stripAnsi';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ---------------------------------------------------------------------------
// Client-side character cleanup for agent output text.
// Catches residual CLI noise that the server-side ChatExtractor may miss.
// ---------------------------------------------------------------------------
const OUTPUT_NOISE_PATTERNS = [
  /\x1b\[[0-9;]*[a-zA-Z]/g,                          // residual ANSI escapes
  /^\s*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏●◐◑◒◓⣾⣽⣻⢿⡿⣟⣯⣷▁▂▃▄▅▆▇█]+\s*/gm, // spinners
  /^\s*[─━═╌╍┄┅┈┉╴╶╸╺]+\s*$/gm,                     // horizontal rules
  /^\s*[\u2500-\u257F]+\s*$/gm,                       // box-drawing lines
  /^╭[─╌]+.*╮$/gm,                                    // box top borders
  /^╰[─╌]+.*╯$/gm,                                    // box bottom borders
  /^│.*│$/gm,                                          // box content lines
  /^\s*Claude Code v[\d.]+/gm,                         // version strings
  /^\s*Opus \d[\d.]*\s*with\s*\w+\s*effort/gm,        // "Opus 4.6 with medium effort"
  /Opus\d[\d.]*with\w+effort/gi,                       // concatenated version (no spaces)
  /\(shift\+tab\s*to\s*cycle\)/gi,                     // key hint
  /shift\+?tab\s*to\s*cycle/gi,                        // variant
  /bypass\s*permissions?\s*on/gi,                       // permissions prompt
  /^\s*[✢✶✻✽·*]+\s*$/gm,                             // bare decoration chars
  /^\s*[※✳✻✽✢✶·*☆★⊛⊕⊙◉◎⚡⚙].*$/gm,                 // decorative symbol lines
  /^\s*[▸▶►‣⏵]+\s*/gm,                                // arrow prompts
  /[·•●◉]\s*(esc|medium|high|low|\/\w)/gi,             // status bar fragments
  /esc\s*to\s*int[.…]*/gi,                             // "esc to int..."
  /medium\s*[·•●◉.]\s*\/eff/gi,                        // status bar
  /^\s*Deliberating[.…]*\s*$/gm,                       // "Deliberating..."
  /^\s*\w{1,20}ing[.…]{2,3}\s*$/gm,                   // gerund + ellipsis fragments
  /^\s*[⎿⏐⏎│]\s*Tip:\s*Use\s*\/feedback.*$/gm,       // feedback tip
  /^\s*Tip:\s*Use\s*\/feedback.*$/gm,                  // feedback tip variant
  /^\s*MEMORIA NON SCRITTA:.*$/gm,                     // memory hook warnings
  /^\s*⚠\s*MEMORIA NON SCRITTA.*$/gm,                 // memory hook variant
  /\/buddy\b/gi,                                        // /buddy command noise
  // Claude Code banner / header
  /[▐▛▜▌▝▘█]+\s*Claude\s*Code\s*v[\d.]+/gi,           // banner + version
  /[▐▛▜▌▝▘█]+[^a-zA-Z\n]*Claude\s*Max/gi,             // banner + Claude Max
  /[▐▛▜▌▝▘█]{2,}[^a-zA-Z\n]*/gm,                      // half-block char runs
  // System prompt / reinject echoes
  /Claude\s*runtime\s*is\s*active\s*for\s*this\s*Swarm/gi,
  /Continue\s*the\s*workflow\s*using\s*the\s*shared\s*task\s*context/gi,
  /is\s*not\s*the\s*end\s*of\s*the\s*workflow\s*yet/gi,
  /Do\s*not\s*stop\s*at\s*the\s*done\s*marker/gi,
  /downstream\s*agents?\s*still\s*need\s*your\s*output/gi,
  /Finish\s*your\s*work,?\s*then\s*hand\s*off\s*to/gi,
  /Execute\s*the\s*workflow\s*goal\s*described\s*here/gi,
  /❯\s*Claude\s*runtime/gi,
  /❯\s*\w+\s*is\s*not\s*the\s*end/gi,
  // Hook and CLI noise
  /Now using extra usage/gi,
  /\(?\s*running\s*stop\s*hook\s*\)?\s*/gi,
  /Stop says:.*$/gm,
  /⚠️?\s*MEMORIA NON SCRITTA.*/gm,
  /^\s*\d+\s*settings?\s*issues?\s*$/gm,                // "1 settings issue"
  /^\s*◐\s*medium\b.*$/gm,                              // "◐medium..." spinner status
  // ACTIVITY_LOG / memory hook echoes
  /ACTIVITY_LOG\.md\b[^]*?(?:chiudere|close)\./gi,      // hook echo about activity log
  /Verifica\s*che\s*ogni\s*agente\b[^]*?(?:chiudere|close)\./gi, // hook verification echo
  /Found\d*settings?issues?/gi,                          // "Found2settingsissues" (concatenated)
  /\bFound\s*\d+\s*settings?\s*issues?\b/gi,            // "Found 2 settings issues" (spaced)
  /^\s*[─━═]{4,}[^a-zA-Z]*$/gm,                         // long horizontal rules (────...────)
  /[⏵⏴]{2,}/g,                                           // repeated arrow chars
  /\(shift\+tab\b[^)]*\)/gi,                             // "(shift+tab ...)" any variant
  /shift\+tab\s*\w+/gi,                                  // "shift+tab Found..." concatenated
];

function cleanOutputText(raw) {
  if (!raw) return '';
  let text = stripAnsi(String(raw));
  for (const pat of OUTPUT_NOISE_PATTERNS) {
    pat.lastIndex = 0;
    text = text.replace(pat, '');
  }
  // Collapse excessive blank lines
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

// ---------------------------------------------------------------------------
// Tab bar pill button
// ---------------------------------------------------------------------------
function TabPill({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-xs rounded transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-gray-700 text-gray-400 hover:text-white hover:bg-gray-600'
      }`}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Handoff card
// ---------------------------------------------------------------------------
function HandoffCard({ handoff }) {
  const ts = handoff.timestamp
    ? new Date(handoff.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '';

  return (
    <div className="bg-gray-800 rounded p-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-cyan-300 font-medium">
          &rarr; {handoff.target || 'unknown'}
        </span>
        {ts && <span className="text-gray-500">{ts}</span>}
      </div>
      <pre className="text-[11px] text-gray-300 font-mono whitespace-pre-wrap break-words bg-gray-900 rounded p-2 overflow-x-auto">
        {JSON.stringify(handoff.payload ?? handoff, null, 2)}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------
export default function AgentOutputPanel({ nodeId, nodeLabel, onClose, onSwitchToInspector }) {
  const agentResult = useSwarmStore((s) => s.agentResults[nodeId]);
  const markViewed = useSwarmStore((s) => s.markAgentResultViewed);

  const rawFinalText = agentResult?.finalText || '';
  const handoffs = agentResult?.handoffPayloads || [];
  const hasHandoffs = handoffs.length > 0;
  const finalText = useMemo(() => cleanOutputText(rawFinalText), [rawFinalText]);
  const [activeTab, setActiveTab] = useState('output');
  const [copyLabel, setCopyLabel] = useState('Copy');

  const contentRef = useRef(null);

  // Mark viewed on mount and scroll to top
  useEffect(() => {
    if (nodeId) markViewed(nodeId);
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [nodeId, markViewed]);

  // Reset tab if handoffs disappear
  useEffect(() => {
    if (!hasHandoffs && activeTab === 'handoff') setActiveTab('output');
  }, [hasHandoffs, activeTab]);

  // Copy handler
  const handleCopy = async () => {
    let text = '';
    if (activeTab === 'output') {
      text = finalText;
    } else {
      text = JSON.stringify(handoffs, null, 2);
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopyLabel('Copied!');
      setTimeout(() => setCopyLabel('Copy'), 2000);
    } catch {
      // Fallback: silent fail
    }
  };

  return (
    <div className="w-[19rem] min-w-[19rem] shrink-0 bg-gray-900 border-l border-gray-700 p-4 text-white text-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="font-semibold text-sm truncate flex-1">
          {nodeLabel || nodeId}
        </span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-lg leading-none flex-shrink-0"
          aria-label="Close output panel"
        >
          &times;
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1.5 mb-3">
        <TabPill
          label="Output"
          active={activeTab === 'output'}
          onClick={() => setActiveTab('output')}
        />
        {hasHandoffs && (
          <TabPill
            label="Handoff"
            active={activeTab === 'handoff'}
            onClick={() => setActiveTab('handoff')}
          />
        )}
      </div>

      {/* Content area */}
      <div ref={contentRef} className="flex-1 overflow-y-auto min-h-0">
        {activeTab === 'output' && (
          <div className="prose prose-invert prose-sm max-w-none text-[12px] leading-relaxed prose-p:my-2 prose-headings:mt-3 prose-headings:mb-1 prose-li:my-0.5 prose-ul:my-1 prose-ol:my-1">
            {finalText ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {finalText}
              </ReactMarkdown>
            ) : (
              <p className="text-gray-500 italic">
                No output captured for this agent.
              </p>
            )}
          </div>
        )}

        {activeTab === 'handoff' && (
          <div className="flex flex-col gap-2">
            {handoffs.map((h, idx) => (
              <HandoffCard key={idx} handoff={h} />
            ))}
          </div>
        )}
      </div>

      {/* Footer action bar */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-700">
        <button
          onClick={handleCopy}
          className="flex-1 text-xs px-2 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
        >
          {copyLabel}
        </button>
        <button
          onClick={onSwitchToInspector || onClose}
          className="flex-1 text-xs px-2 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
        >
          &larr; Inspector
        </button>
      </div>
    </div>
  );
}

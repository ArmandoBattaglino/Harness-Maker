import { formatAgentOutputText } from './formatAgentOutput.js';
import { isStructuredSpawnMode } from './runtimeModes.js';

function normalizeTimestamp(timestamp) {
  if (timestamp === null || timestamp === undefined || timestamp === '') return null;
  const value = new Date(timestamp).getTime();
  return Number.isFinite(value) ? value : null;
}

function buildChatDerivedEntries(nodeId, chatMessages = [], fallbackSpawnMode = null) {
  const filteredMessages = (Array.isArray(chatMessages) ? chatMessages : []).filter((message) => (
    message?.nodeId === nodeId
    && (message.role === 'assistant' || !message.role)
    && String(message.text ?? '').trim()
  ));

  if (filteredMessages.length === 0) return [];

  const entries = [];
  const groupedByTurn = new Map();

  filteredMessages.forEach((message, index) => {
    const rawText = String(message.text ?? '');
    if (!rawText.trim()) return;
    const spawnMode = message.spawnMode ?? fallbackSpawnMode ?? null;
    const timestamp = normalizeTimestamp(message.timestamp);
    const turnId = message.turnId ?? null;
    const shouldGroupByTurn = Boolean(turnId) && isStructuredSpawnMode(spawnMode);

    if (!shouldGroupByTurn) {
      entries.push({
        id: `chat-${nodeId}-${index}-${timestamp ?? 'na'}`,
        text: formatAgentOutputText(rawText, spawnMode),
        timestamp,
        turnId,
        spawnMode,
      });
      return;
    }

    const existing = groupedByTurn.get(turnId);
    if (!existing) {
      groupedByTurn.set(turnId, {
        id: `turn-${nodeId}-${turnId}`,
        rawText,
        timestamp,
        turnId,
        spawnMode,
      });
      entries.push(groupedByTurn.get(turnId));
      return;
    }

    existing.rawText += rawText;
    existing.timestamp = timestamp ?? existing.timestamp;
    existing.spawnMode = spawnMode ?? existing.spawnMode;
  });

  return entries.map((entry) => (
    entry.rawText !== undefined
      ? {
          id: entry.id,
          text: formatAgentOutputText(entry.rawText, entry.spawnMode),
          timestamp: entry.timestamp,
          turnId: entry.turnId,
          spawnMode: entry.spawnMode,
        }
      : entry
  ));
}

function buildPersistedEntries(agentResult = null, fallbackSpawnMode = null) {
  const persistedEntries = Array.isArray(agentResult?.outputEntries) ? agentResult.outputEntries : [];
  if (persistedEntries.length > 0) {
    return persistedEntries.map((entry, index) => {
      const spawnMode = entry?.spawnMode ?? fallbackSpawnMode ?? null;
      return {
        id: entry?.id || `persisted-${index}`,
        text: formatAgentOutputText(entry?.text ?? '', spawnMode),
        timestamp: normalizeTimestamp(entry?.timestamp),
        turnId: entry?.turnId ?? null,
        spawnMode,
      };
    });
  }

  const legacyText = formatAgentOutputText(agentResult?.finalText ?? '', fallbackSpawnMode);
  if (!legacyText) return [];

  return [{
    id: `legacy-final-${agentResult?.updatedAt ?? 'na'}`,
    text: legacyText,
    timestamp: normalizeTimestamp(agentResult?.updatedAt),
    turnId: null,
    spawnMode: fallbackSpawnMode ?? null,
  }];
}

export function getAgentOutputEntries({ nodeId, chatMessages = [], agentResult = null, spawnMode = null }) {
  const chatEntries = buildChatDerivedEntries(nodeId, chatMessages, spawnMode);
  const baseEntries = chatEntries.length > 0 ? chatEntries : buildPersistedEntries(agentResult, spawnMode);
  return [...baseEntries].reverse();
}

export function serializeAgentOutputEntries(entries = []) {
  return entries
    .map((entry, index) => {
      const header = entry?.timestamp
        ? `Output ${entries.length - index} - ${new Date(entry.timestamp).toLocaleString()}`
        : `Output ${entries.length - index}`;
      return `${header}\n\n${entry?.text ?? ''}`.trim();
    })
    .filter(Boolean)
    .join('\n\n---\n\n');
}

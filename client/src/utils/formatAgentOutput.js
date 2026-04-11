import { formatChatText, formatStreamJsonText } from './formatChatText';
import { isStructuredSpawnMode } from './runtimeModes';

export function formatAgentOutputText(rawText = '', spawnMode = null) {
  if (!rawText) return '';
  return isStructuredSpawnMode(spawnMode)
    ? formatStreamJsonText(rawText)
    : formatChatText(rawText);
}

export function getPreferredAgentLiveSnippet(agentState) {
  if (!agentState) return '';
  if (isStructuredSpawnMode(agentState.spawnMode)) {
    return agentState.lastChatSnippet || agentState.lastOutputSnippet || '';
  }
  return agentState.lastOutputSnippet || agentState.lastChatSnippet || '';
}

export function formatAgentLiveSnippet(agentState) {
  return formatAgentOutputText(
    getPreferredAgentLiveSnippet(agentState),
    agentState?.spawnMode ?? null,
  );
}

const EXECUTION_STORAGE_KEY = 'swarm-active-execution';

export function readStoredExecution() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(EXECUTION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeStoredExecution(snapshot) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(EXECUTION_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage failures; live runtime state still works in-memory.
  }
}

export function clearStoredExecution() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(EXECUTION_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export { EXECUTION_STORAGE_KEY };

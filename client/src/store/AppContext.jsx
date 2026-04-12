import React, { createContext, useContext, useEffect, useReducer } from 'react';

const ACTIVE_PROJECT_STORAGE_KEY = 'ccvm-active-project-id';
const APP_VIEW_STORAGE_KEY = 'ccvm-app-view';
const VALID_VIEWS = new Set([
  'projects',
  'terminal',
  'jobs',
  'deployments',
  'context',
  'swarm',
  'pack-builder',
  'packs',
]);

function readPersistedActiveProjectId() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

function readPersistedView() {
  if (typeof window === 'undefined') return 'projects';
  try {
    const persistedView = window.localStorage.getItem(APP_VIEW_STORAGE_KEY);
    return VALID_VIEWS.has(persistedView) ? persistedView : 'projects';
  } catch {
    return 'projects';
  }
}

// --- Initial State ---
const initialState = {
  projects: [],
  sessions: {}, // { [projectId]: { sessionId, status, pid } }
  activeProjectId: null,
  projectsHydrated: false,
  view: 'projects', // 'projects' | 'terminal' | 'jobs' | 'deployments' | 'context' | 'swarm' | 'pack-builder' | 'packs'
  navigationIntent: null,
};

// --- Reducer ---
function appReducer(state, action) {
  switch (action.type) {
    case 'SET_PROJECTS':
      return { ...state, projects: action.payload, projectsHydrated: true };

    case 'ADD_PROJECT':
      return { ...state, projects: [...state.projects, action.payload], projectsHydrated: true };

    case 'REMOVE_PROJECT': {
      const sessions = { ...state.sessions };
      delete sessions[action.payload];
      return {
        ...state,
        projects: state.projects.filter((p) => p.id !== action.payload),
        projectsHydrated: true,
        sessions,
        activeProjectId:
          state.activeProjectId === action.payload ? null : state.activeProjectId,
      };
    }

    case 'SET_SESSION':
      return {
        ...state,
        sessions: {
          ...state.sessions,
          [action.payload.projectId]: action.payload.session,
        },
      };

    case 'REMOVE_SESSION': {
      const sessions = { ...state.sessions };
      delete sessions[action.payload];
      return { ...state, sessions };
    }

    case 'SET_ACTIVE_PROJECT':
      return { ...state, activeProjectId: action.payload };

    case 'SET_VIEW':
      return { ...state, view: VALID_VIEWS.has(action.payload) ? action.payload : 'projects' };

    case 'SET_NAVIGATION_INTENT':
      return { ...state, navigationIntent: action.payload ?? null };

    case 'CLEAR_NAVIGATION_INTENT':
      return { ...state, navigationIntent: null };

    default:
      return state;
  }
}

function initAppState() {
  return {
    ...initialState,
    activeProjectId: readPersistedActiveProjectId(),
    view: readPersistedView(),
  };
}

// --- Contexts ---
const AppStateContext = createContext(null);
const AppDispatchContext = createContext(null);

// --- Provider ---
export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState, initAppState);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (state.activeProjectId) {
        window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, state.activeProjectId);
      } else {
        window.localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY);
      }
    } catch {
      // Ignore persistence failures; the in-memory app state still works.
    }
  }, [state.activeProjectId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(APP_VIEW_STORAGE_KEY, state.view);
    } catch {
      // Ignore persistence failures; the in-memory app state still works.
    }
  }, [state.view]);

  useEffect(() => {
    if (!state.activeProjectId || !state.projectsHydrated) return;
    const projectStillExists = state.projects.some((project) => project.id === state.activeProjectId);
    if (!projectStillExists) {
      dispatch({ type: 'SET_ACTIVE_PROJECT', payload: null });
    }
  }, [state.activeProjectId, state.projects, state.projectsHydrated]);

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>
        {children}
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}

// --- Hooks ---
export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (ctx === null) {
    throw new Error('useAppState must be used inside AppProvider');
  }
  return ctx;
}

export function useAppDispatch() {
  const ctx = useContext(AppDispatchContext);
  if (ctx === null) {
    throw new Error('useAppDispatch must be used inside AppProvider');
  }
  return ctx;
}

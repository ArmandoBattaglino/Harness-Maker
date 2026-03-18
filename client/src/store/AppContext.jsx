import React, { createContext, useContext, useReducer } from 'react';

// --- Initial State ---
const initialState = {
  projects: [],
  sessions: {}, // { [projectId]: { sessionId, status, pid } }
  activeProjectId: null,
  view: 'terminal', // 'terminal' | 'jobs' | 'entities' | 'projects'
};

// --- Reducer ---
function appReducer(state, action) {
  switch (action.type) {
    case 'SET_PROJECTS':
      return { ...state, projects: action.payload };

    case 'ADD_PROJECT':
      return { ...state, projects: [...state.projects, action.payload] };

    case 'REMOVE_PROJECT': {
      const sessions = { ...state.sessions };
      delete sessions[action.payload];
      return {
        ...state,
        projects: state.projects.filter((p) => p.id !== action.payload),
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
      return { ...state, view: action.payload };

    default:
      return state;
  }
}

// --- Contexts ---
const AppStateContext = createContext(null);
const AppDispatchContext = createContext(null);

// --- Provider ---
export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

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

import { createContext, useContext } from 'react';

const CanvasActionsContext = createContext(null);

export function useCanvasActions() {
  return useContext(CanvasActionsContext);
}

export default CanvasActionsContext;

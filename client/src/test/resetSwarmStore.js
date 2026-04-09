import { useSwarmStore } from '../store/SwarmContext.jsx';

export function resetSwarmStore() {
  useSwarmStore.getState().reset();
  useSwarmStore.setState({
    workflowDef: null,
    selectedRuntimeProvider: 'auto',
  });
}

import { useState } from 'react';
import { apiPost } from '../hooks/useApi.js';
import { useAppDispatch } from '../store/AppContext.jsx';

export default function AddProjectModal({ onClose }) {
  const dispatch = useAppDispatch();
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [scaffold, setScaffold] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const data = await apiPost('/api/v1/projects', {
        name: name.trim(),
        path: path.trim(),
        scaffold,
      });
      dispatch({ type: 'ADD_PROJECT', payload: data.project });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
      <div
        className="w-full max-w-md rounded border border-gray-700 bg-gray-900 p-6"
        style={{ maxWidth: '440px' }}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Add Project</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="my-project"
              className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-gray-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">Absolute Path</label>
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              required
              placeholder="C:\Users\you\projects\my-project"
              className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-gray-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="scaffold-checkbox"
              type="checkbox"
              checked={scaffold}
              onChange={(e) => setScaffold(e.target.checked)}
              className="h-4 w-4 accent-green-500"
            />
            <label htmlFor="scaffold-checkbox" className="text-xs text-gray-300 cursor-pointer">
              Scaffold .claude/ directory
            </label>
          </div>

          {error && (
            <p className="rounded border border-red-800 bg-red-900 bg-opacity-40 px-3 py-2 text-xs text-red-400">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded border border-gray-700 bg-transparent px-4 py-2 text-xs text-gray-300 hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim() || !path.trim()}
              className="rounded border border-green-700 bg-green-900 bg-opacity-40 px-4 py-2 text-xs text-green-300 hover:bg-opacity-70 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Adding...' : 'Add Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

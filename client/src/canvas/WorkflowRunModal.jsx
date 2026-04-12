import { useMemo, useState } from 'react';

const INPUT_CLS =
  'mt-1 w-full rounded bg-gray-950 px-3 py-2 text-sm text-white border border-gray-700 focus:border-green-500 focus:outline-none';
const MAX_IMAGE_INPUT_BYTES = 10 * 1024 * 1024;
const IMAGE_INPUT_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function coerceInputValue(type, rawValue) {
  if (rawValue === '') return '';
  if (type === 'number') {
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : rawValue;
  }
  if (type === 'integer') {
    const parsed = Number.parseInt(rawValue, 10);
    return Number.isFinite(parsed) ? parsed : rawValue;
  }
  if (type === 'json') {
    try {
      return JSON.parse(rawValue);
    } catch {
      return rawValue;
    }
  }
  return rawValue;
}

function stringifyFieldValue(value) {
  if (value == null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function buildInitialValues(inputContract) {
  return Object.fromEntries(inputContract.map((field) => {
    if (field.defaultValue !== undefined && field.defaultValue !== '') {
      return [field.key, field.defaultValue];
    }
    if (field.type === 'boolean') return [field.key, false];
    if (field.type === 'image') return [field.key, null];
    return [field.key, ''];
  }));
}

function validateValues(inputContract, values) {
  const errors = [];
  for (const field of inputContract) {
    const value = values[field.key];
    const empty = value === '' || value === null || value === undefined;
    if (field.required && empty) {
      errors.push(`${field.label || field.key} is required.`);
      continue;
    }
    if (empty) continue;
    if (field.type === 'number' && typeof value !== 'number') {
      errors.push(`${field.label || field.key} must be a number.`);
    }
    if (field.type === 'integer' && !Number.isInteger(value)) {
      errors.push(`${field.label || field.key} must be an integer.`);
    }
    if (field.type === 'json' && typeof value === 'string') {
      errors.push(`${field.label || field.key} must be valid JSON.`);
    }
    if (field.type === 'enum' && Array.isArray(field.options) && !field.options.includes(value)) {
      errors.push(`${field.label || field.key} must be one of: ${field.options.join(', ')}.`);
    }
    if (field.type === 'image') {
      if (!value || typeof value !== 'object') {
        errors.push(`${field.label || field.key} must be an image reference.`);
      } else if (!IMAGE_INPUT_MIME_TYPES.has(value.mimeType)) {
        errors.push(`${field.label || field.key} must be PNG, JPEG, WebP, or GIF.`);
      } else if (/[\\/]|(^|[.])\.\.($|[.])/.test(value.name || '')) {
        errors.push(`${field.label || field.key} must use a safe file name.`);
      } else if (value.size > MAX_IMAGE_INPUT_BYTES) {
        errors.push(`${field.label || field.key} must be 10 MB or smaller.`);
      }
    }
  }
  return errors;
}

function WorkflowInputField({ field, value, onChange }) {
  const label = field.label || field.key;
  const helpText = field.helpText || field.key;

  if (field.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 rounded border border-gray-700 bg-gray-900/80 p-3 text-sm text-gray-200">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          className="accent-green-500"
        />
        <span>
          {label}
          {field.required ? <span className="ml-1 text-red-300">*</span> : null}
          {helpText ? <span className="block text-[11px] text-gray-500">{helpText}</span> : null}
        </span>
      </label>
    );
  }

  if (field.type === 'enum') {
    return (
      <label className="block text-xs font-semibold text-gray-300">
        {label}{field.required ? <span className="ml-1 text-red-300">*</span> : null}
        <select className={INPUT_CLS} value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
          <option value="">Select...</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        {helpText ? <span className="mt-1 block text-[11px] text-gray-500">{helpText}</span> : null}
      </label>
    );
  }

  if (field.type === 'textarea' || field.type === 'json' || field.type === 'markdown') {
    return (
      <label className="block text-xs font-semibold text-gray-300">
        {label}{field.required ? <span className="ml-1 text-red-300">*</span> : null}
        <textarea
          className={`${INPUT_CLS} min-h-24 resize-y`}
          value={stringifyFieldValue(value)}
          onChange={(event) => onChange(coerceInputValue(field.type, event.target.value))}
          placeholder={helpText}
        />
      </label>
    );
  }

  if (field.type === 'image') {
    return (
      <label className="block text-xs font-semibold text-gray-300">
        {label}{field.required ? <span className="ml-1 text-red-300">*</span> : null}
        <input
          className={INPUT_CLS}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) {
              onChange(null);
              return;
            }
            onChange({
              assetId: `pending-run-${file.name}-${file.size}-${file.lastModified}`,
              name: file.name,
              mimeType: file.type,
              size: file.size,
              previewUrl: '',
            });
          }}
        />
        {value?.name ? (
          <span className="mt-1 block text-[11px] text-gray-400">
            Selected {value.name} ({Math.ceil((value.size || 0) / 1024)} KB). Image content is referenced by metadata; raw base64 is not submitted.
          </span>
        ) : helpText ? (
          <span className="mt-1 block text-[11px] text-gray-500">{helpText}</span>
        ) : null}
      </label>
    );
  }

  const inputType = field.type === 'number' || field.type === 'integer' ? 'number' : 'text';
  return (
    <label className="block text-xs font-semibold text-gray-300">
      {label}{field.required ? <span className="ml-1 text-red-300">*</span> : null}
      <input
        className={INPUT_CLS}
        type={inputType}
        value={value ?? ''}
        onChange={(event) => onChange(coerceInputValue(field.type, event.target.value))}
        placeholder={helpText}
      />
    </label>
  );
}

export default function WorkflowRunModal({ workflowName, inputContract = [], outputContract = {}, onSubmit, onClose }) {
  const normalizedInputs = Array.isArray(inputContract) ? inputContract : [];
  const [values, setValues] = useState(() => buildInitialValues(normalizedInputs));
  const [errors, setErrors] = useState([]);
  const outputSummary = useMemo(() => {
    const outputs = outputContract?.outputs?.map((item) => item.label || item.key) ?? [];
    const artifacts = outputContract?.artifacts?.map((item) => item.label || item.key) ?? [];
    return { outputs, artifacts };
  }, [outputContract]);

  function updateValue(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors([]);
  }

  function handleSubmit() {
    const validationErrors = validateValues(normalizedInputs, values);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    onSubmit(values);
  }

  const inputGroups = useMemo(() => {
    const groups = [];
    const groupIndex = new Map();
    normalizedInputs.forEach((field) => {
      const groupKey = field.inputNodeId || '__legacy__';
      if (!groupIndex.has(groupKey)) {
        groupIndex.set(groupKey, groups.length);
        groups.push({
          key: groupKey,
          label: field.groupLabel || field.inputNodeLabel || (groupKey === '__legacy__' ? 'Workflow inputs' : groupKey),
          prompt: field.groupPrompt || '',
          fields: [],
        });
      }
      groups[groupIndex.get(groupKey)].fields.push(field);
    });
    return groups;
  }, [normalizedInputs]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex max-h-[86vh] w-[540px] flex-col rounded-xl border border-gray-600 bg-gray-800 shadow-2xl">
        <div className="shrink-0 border-b border-gray-700 px-4 py-3">
          <h2 className="text-sm font-semibold text-white">Run workflow</h2>
          <p className="mt-1 text-xs text-gray-400">{workflowName || 'Workflow'} will run with workflow-native inputs.</p>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {normalizedInputs.length === 0 ? (
            <p className="rounded border border-gray-700 bg-gray-900/70 p-3 text-xs text-gray-400">
              This workflow has no declared inputs. Launching still records an empty workflow run.
            </p>
          ) : inputGroups.map((group) => (
            <section key={group.key} className="rounded border border-gray-700 bg-gray-900/40 p-3">
              <div className="mb-3">
                <h3 className="text-xs font-semibold text-green-200">{group.label}</h3>
                {group.prompt ? <p className="mt-1 text-[11px] text-gray-500">{group.prompt}</p> : null}
              </div>
              <div className="space-y-3">
                {group.fields.map((field) => (
                  <WorkflowInputField
                    key={field.key}
                    field={field}
                    value={values[field.key]}
                    onChange={(value) => updateValue(field.key, value)}
                  />
                ))}
              </div>
            </section>
          ))}

          {(outputSummary.outputs.length > 0 || outputSummary.artifacts.length > 0) && (
            <div className="rounded border border-green-900/60 bg-green-950/20 p-3 text-xs text-green-100">
              <div className="font-semibold">Expected run result</div>
              {outputSummary.outputs.length > 0 && <div>Outputs: {outputSummary.outputs.join(', ')}</div>}
              {outputSummary.artifacts.length > 0 && <div>Artifacts: {outputSummary.artifacts.join(', ')}</div>}
            </div>
          )}

          {errors.length > 0 && (
            <div role="alert" className="rounded border border-red-700 bg-red-950/40 p-3 text-xs text-red-200">
              {errors.map((error) => <div key={error}>{error}</div>)}
            </div>
          )}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-gray-700 px-4 py-3">
          <button type="button" onClick={onClose} className="rounded bg-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-600">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} className="rounded bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-500">
            Start workflow
          </button>
        </div>
      </div>
    </div>
  );
}

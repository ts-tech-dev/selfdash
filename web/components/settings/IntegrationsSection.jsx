import { useEffect, useState } from 'preact/hooks';
import {
  integrations,
  availableIntegrations,
  loadIntegrations,
  loadAvailableIntegrations,
  addIntegration,
  editIntegration,
  removeIntegration,
  pollIntegrationNow,
} from '../../store.js';
import { DynamicConfigForm } from '../DynamicConfigForm.jsx';

function blankValue(field) {
  if (field.type === 'checkbox') return false;
  if (field.type === 'multiselect') return Array.isArray(field.default) ? [...field.default] : [];
  return '';
}

function emptyFormFor(typeDef) {
  const form = { name: typeDef.title, interval: typeDef.defaultInterval, config: {} };
  for (const field of typeDef.configSchema.fields) {
    form.config[field.name] = blankValue(field);
  }
  return form;
}

function editFormFor(integration, typeDef) {
  const form = { name: integration.name, interval: integration.interval, config: {} };
  const secretHints = {};
  for (const field of typeDef.configSchema.fields) {
    if (field.type === 'password') {
      secretHints[field.name] = integration.config[field.name] === true;
      form.config[field.name] = '';
    } else {
      form.config[field.name] = integration.config[field.name] ?? blankValue(field);
    }
  }
  return { form, secretHints };
}

function StatusBadge({ integration }) {
  if (!integration.enabled) return <span class="status-badge status-disabled">disabled</span>;
  if (integration.last_status === 'ok') return <span class="status-badge status-ok">ok</span>;
  if (integration.last_status === 'unreachable') return <span class="status-badge status-warn">unreachable</span>;
  if (integration.last_status === 'error') return <span class="status-badge status-error">error</span>;
  return <span class="status-badge">unknown</span>;
}

export function IntegrationsSection() {
  const [addingKey, setAddingKey] = useState('');
  const [addForm, setAddForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editSecretHints, setEditSecretHints] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadIntegrations();
    loadAvailableIntegrations();
  }, []);

  function typeFor(key) {
    return availableIntegrations.value.find((t) => t.key === key);
  }

  function startAdd(key) {
    setAddingKey(key);
    const typeDef = typeFor(key);
    setAddForm(typeDef ? emptyFormFor(typeDef) : null);
  }

  function startEdit(integration) {
    const typeDef = typeFor(integration.key);
    if (!typeDef) return;
    const { form, secretHints } = editFormFor(integration, typeDef);
    setEditingId(integration.id);
    setEditForm(form);
    setEditSecretHints(secretHints);
  }

  async function submitAdd(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await addIntegration({ key: addingKey, ...addForm });
      setAddingKey('');
      setAddForm(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await editIntegration(editingId, editForm);
      setEditingId(null);
      setEditForm(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(integration) {
    if (!confirm(`Delete integration "${integration.name}"? Any widget tiles using it will stop updating.`)) return;
    await removeIntegration(integration.id);
  }

  return (
    <section class="settings-section">
      <h2>Integrations</h2>

      <ul class="integration-list">
        {integrations.value.map((integration) => (
          <li key={integration.id} class="integration-row">
            <div class="integration-row-main">
              <span class="integration-name">{integration.name}</span>
              <span class="integration-type">{integration.title}</span>
              <StatusBadge integration={integration} />
            </div>
            {integration.last_error && <div class="integration-error">{integration.last_error}</div>}
            <div class="integration-row-actions">
              <button type="button" onClick={() => pollIntegrationNow(integration.id)}>
                Poll now
              </button>
              <button type="button" onClick={() => editIntegration(integration.id, { enabled: !integration.enabled })}>
                {integration.enabled ? 'Disable' : 'Enable'}
              </button>
              <button type="button" onClick={() => startEdit(integration)}>
                Edit
              </button>
              <button type="button" onClick={() => onDelete(integration)}>
                Delete
              </button>
            </div>

            {editingId === integration.id && editForm && (
              <form class="integration-edit-form" onSubmit={submitEdit}>
                <label>
                  Name
                  <input value={editForm.name} onInput={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                </label>
                <label>
                  Poll interval (seconds)
                  <input
                    type="number"
                    min="5"
                    value={editForm.interval}
                    onInput={(e) => setEditForm({ ...editForm, interval: Number(e.target.value) })}
                  />
                </label>
                <DynamicConfigForm
                  fields={typeFor(integration.key).configSchema.fields}
                  value={editForm.config}
                  secretHints={editSecretHints}
                  onChange={(name, val) => setEditForm({ ...editForm, config: { ...editForm.config, [name]: val } })}
                />
                <div class="modal-actions">
                  <button type="button" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                  <button type="submit" disabled={busy}>
                    Save
                  </button>
                </div>
              </form>
            )}
          </li>
        ))}
        {integrations.value.length === 0 && <li class="empty-state">No integrations configured yet.</li>}
      </ul>

      <h3>Add integration</h3>
      {availableIntegrations.value.length === 0 && (
        <p class="empty-state">
          No integration types are installed. Drop a <code>*.integration.js</code> file into the data volume's{' '}
          <code>integrations/</code> folder to add one.
        </p>
      )}
      <div class="integration-type-list">
        {availableIntegrations.value.map((typeDef) => (
          <button
            key={typeDef.key}
            type="button"
            class={`integration-type-btn${addingKey === typeDef.key ? ' active' : ''}`}
            onClick={() => startAdd(typeDef.key)}
          >
            {typeDef.title}
          </button>
        ))}
      </div>

      {addForm && (
        <form class="integration-edit-form" onSubmit={submitAdd}>
          <label>
            Name
            <input value={addForm.name} onInput={(e) => setAddForm({ ...addForm, name: e.target.value })} />
          </label>
          <label>
            Poll interval (seconds)
            <input
              type="number"
              min="5"
              value={addForm.interval}
              onInput={(e) => setAddForm({ ...addForm, interval: Number(e.target.value) })}
            />
          </label>
          <DynamicConfigForm
            fields={typeFor(addingKey).configSchema.fields}
            value={addForm.config}
            onChange={(name, val) => setAddForm({ ...addForm, config: { ...addForm.config, [name]: val } })}
          />
          <div class="modal-actions">
            <button
              type="button"
              onClick={() => {
                setAddingKey('');
                setAddForm(null);
              }}
            >
              Cancel
            </button>
            <button type="submit" disabled={busy}>
              Add
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

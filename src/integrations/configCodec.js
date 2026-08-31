// Shared by src/routes/integrations.js and src/poller/scheduler.js so encryption,
// masking, and validation of integration config stay in exactly one place.

export function encodeConfig(configObj, crypto) {
  const json = JSON.stringify(configObj || {});
  return crypto ? crypto.encrypt(json) : json;
}

export function decodeConfig(stored, crypto) {
  if (!stored) return {};
  const json = crypto ? crypto.decrypt(stored) : stored;
  return JSON.parse(json);
}

// Password fields are never sent to the frontend in plaintext — only whether one is set.
export function maskConfig(configObj, IntegrationClass) {
  const masked = { ...configObj };
  for (const field of IntegrationClass?.configSchema?.fields || []) {
    if (field.type === 'password') {
      masked[field.name] = Boolean(masked[field.name]);
    }
  }
  return masked;
}

// A blank password field in a PATCH means "keep the existing secret", not "clear it".
export function mergeConfig(existing, incoming, IntegrationClass) {
  const merged = { ...existing };
  const fields = IntegrationClass?.configSchema?.fields || [];
  const byName = new Map(fields.map((f) => [f.name, f]));

  for (const [name, value] of Object.entries(incoming || {})) {
    const field = byName.get(name);
    if (!field) continue;
    if (field.type === 'password' && (value === '' || value === undefined || value === null)) continue;
    merged[name] = value;
  }
  return merged;
}

export function validateConfig(IntegrationClass, configObj) {
  const errors = [];
  for (const field of IntegrationClass?.configSchema?.fields || []) {
    const val = configObj[field.name];
    const label = field.label || field.name;

    if (field.type === 'multiselect') {
      const arr = Array.isArray(val) ? val : val == null || val === '' ? [] : [val];
      const allowed = new Set((field.options || []).map((o) => (typeof o === 'string' ? o : o.value)));
      if (field.required && arr.length === 0) {
        errors.push(`${label} needs at least one option selected`);
      }
      for (const v of arr) {
        if (!allowed.has(v)) errors.push(`${label} has an unknown option: ${v}`);
      }
      continue;
    }

    if (field.required && (val === undefined || val === null || val === '')) {
      errors.push(`${label} is required`);
      continue;
    }
    if (val === undefined || val === null || val === '') continue;

    if (field.type === 'url' && !/^https?:\/\//i.test(val)) {
      errors.push(`${label} must start with http:// or https://`);
    }
    if (field.type === 'number' && Number.isNaN(Number(val))) {
      errors.push(`${label} must be a number`);
    }
    if (field.type === 'select') {
      const allowed = (field.options || []).map((o) => (typeof o === 'string' ? o : o.value));
      if (!allowed.includes(val)) {
        errors.push(`${label} must be one of ${allowed.join(', ')}`);
      }
    }
  }
  return errors;
}

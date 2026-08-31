const INPUT_TYPES = new Set(['text', 'url', 'password', 'number']);

export function DynamicConfigForm({ fields, value, onChange, secretHints = {} }) {
  return (
    <>
      {fields.map((field) => {
        const type = INPUT_TYPES.has(field.type) ? field.type : 'text';
        const hasExisting = secretHints[field.name];

        if (field.type === 'checkbox') {
          return (
            <label key={field.name} class="checkbox-field">
              <input
                type="checkbox"
                checked={Boolean(value[field.name])}
                onChange={(e) => onChange(field.name, e.target.checked)}
              />
              {field.label || field.name}
            </label>
          );
        }

        if (field.type === 'multiselect') {
          const selected = Array.isArray(value[field.name]) ? value[field.name] : [];
          return (
            <div key={field.name} class="multiselect-field">
              <span class="multiselect-label">{field.label || field.name}</span>
              {(field.options || []).map((opt) => {
                const optValue = typeof opt === 'string' ? opt : opt.value;
                const optLabel = typeof opt === 'string' ? opt : opt.label;
                return (
                  <label key={optValue} class="checkbox-field">
                    <input
                      type="checkbox"
                      checked={selected.includes(optValue)}
                      onChange={(e) =>
                        onChange(
                          field.name,
                          e.target.checked
                            ? [...selected, optValue]
                            : selected.filter((v) => v !== optValue)
                        )
                      }
                    />
                    {optLabel}
                  </label>
                );
              })}
            </div>
          );
        }

        if (field.type === 'textarea') {
          return (
            <label key={field.name}>
              {field.label || field.name}
              <textarea
                rows={field.rows || 6}
                value={value[field.name] ?? ''}
                onInput={(e) => onChange(field.name, e.target.value)}
              />
            </label>
          );
        }

        if (field.type === 'select') {
          return (
            <label key={field.name}>
              {field.label || field.name}
              <select value={value[field.name] ?? ''} onChange={(e) => onChange(field.name, e.target.value)}>
                {(field.options || []).map((opt) => {
                  const optValue = typeof opt === 'string' ? opt : opt.value;
                  const optLabel = typeof opt === 'string' ? opt : opt.label;
                  return (
                    <option key={optValue} value={optValue}>
                      {optLabel}
                    </option>
                  );
                })}
              </select>
            </label>
          );
        }

        return (
          <label key={field.name}>
            {field.label || field.name}
            {field.required && !hasExisting ? ' *' : ''}
            <input
              type={type}
              value={value[field.name] ?? ''}
              required={field.required && !hasExisting}
              placeholder={field.type === 'password' && hasExisting ? '(unchanged — leave blank to keep)' : ''}
              onInput={(e) => onChange(field.name, e.target.value)}
            />
          </label>
        );
      })}
    </>
  );
}

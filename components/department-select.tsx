"use client";

import { Check, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

export type DepartmentOption = { id: string; name: string; status?: string };

/** Name as shown to the administrator; draft departments stay visibly marked. */
function displayName(option: DepartmentOption) {
  return option.status && option.status !== "PUBLISHED"
    ? `${option.name} (${option.status.toLowerCase()})`
    : option.name;
}

/**
 * Searchable department selector.
 *
 * Administrators pick a department by name and never need to know or type the
 * internal database id: the component keeps the selected id and submits it,
 * while the visible value is always the department name. Keyboard accessible
 * (Arrow keys, Enter, Escape, Home/End) with combobox/listbox semantics.
 */
export function DepartmentSelect({
  value,
  onChange,
  options,
  required = false,
  label = "Department",
  hint,
  disabled = false,
  id,
  noneLabel,
}: {
  value: string;
  onChange: (id: string) => void;
  options: DepartmentOption[];
  required?: boolean;
  label?: string;
  hint?: string;
  disabled?: boolean;
  id?: string;
  /** Optional "no department" choice, for institute-wide records. */
  noneLabel?: string;
}) {
  const generatedId = useId();
  const inputId = id || `department-select-${generatedId}`;
  const listId = `${inputId}-list`;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const container = useRef<HTMLDivElement>(null);

  const selected = options.find((option) => option.id === value);
  const sorted = useMemo(() => [...options].sort((a, b) => a.name.localeCompare(b.name)), [options]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return sorted;
    return sorted.filter((option) => option.name.toLowerCase().includes(term));
  }, [query, sorted]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (container.current && !container.current.contains(event.target as Node)) { setOpen(false); setQuery(""); }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const choose = (option: DepartmentOption) => { onChange(option.id); setQuery(""); setOpen(false); setHighlight(0); };
  const keyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) { setOpen(true); return; }
      if (!filtered.length) return;
      setHighlight((current) => (event.key === "ArrowDown" ? (current + 1) % filtered.length : (current - 1 + filtered.length) % filtered.length));
      return;
    }
    if (event.key === "Enter" && open && filtered[highlight]) { event.preventDefault(); choose(filtered[highlight]); return; }
    if (event.key === "Escape") { setOpen(false); setQuery(""); return; }
    if (event.key === "Home" && open) { event.preventDefault(); setHighlight(0); }
    if (event.key === "End" && open) { event.preventDefault(); setHighlight(filtered.length - 1); }
  };

  return <div className="form-field department-select" ref={container}>
    <label htmlFor={inputId}>{label}{required && <span aria-hidden="true"> *</span>}</label>
    <div className="department-select-input">
      <Search size={15} aria-hidden="true" />
      <input
        id={inputId}
        className="form-control"
        type="text"
        role="combobox"
        autoComplete="off"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-required={required}
        aria-activedescendant={open && filtered[highlight] ? `${listId}-${filtered[highlight].id}` : undefined}
        aria-describedby={hint ? `${inputId}-hint` : undefined}
        placeholder={selected ? undefined : "Search departments by name"}
        value={open ? query : selected ? displayName(selected) : ""}
        disabled={disabled}
        required={required && !value}
        onFocus={() => setOpen(true)}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); setHighlight(0); }}
        onKeyDown={keyDown}
      />
    </div>
    {open && <ul className="department-select-list" id={listId} role="listbox" aria-label={label}>
      {noneLabel && (!query.trim() || noneLabel.toLowerCase().includes(query.trim().toLowerCase())) && <li id={`${listId}-none`} role="option" aria-selected={value === ""}>
        <button type="button" className="department-select-option" onMouseEnter={() => setHighlight(-1)} onClick={() => { onChange(""); setQuery(""); setOpen(false); }}>
          <span>{noneLabel}</span>
        </button>
      </li>}
      {filtered.length === 0 && <li className="department-select-empty" aria-disabled="true">No department matches “{query}”.</li>}
      {filtered.map((option, index) => {
        const isSelected = option.id === value;
        return <li key={option.id} id={`${listId}-${option.id}`} role="option" aria-selected={isSelected}>
          <button
            type="button"
            className={`department-select-option${index === highlight ? " active" : ""}`}
            onMouseEnter={() => setHighlight(index)}
            onClick={() => choose(option)}
          >
            <span>
              {option.name}
              {option.status && option.status !== "PUBLISHED" ? <span className="department-select-status"> ({option.status.toLowerCase()})</span> : null}
            </span>
            {isSelected && <Check size={14} aria-hidden="true" />}
          </button>
        </li>;
      })}
    </ul>}
    {hint && <span className="form-hint" id={`${inputId}-hint`}>{hint}</span>}
    {required && !value && <span className="form-hint">Select the department this administrator is scoped to.</span>}
  </div>;
}

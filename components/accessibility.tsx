"use client";

import { Accessibility, Minus, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const STORAGE_KEY = "iet-accessibility-preferences";
type Preferences = { scale: number; contrast: boolean; reducedMotion: boolean };
const defaults: Preferences = { scale: 1, contrast: false, reducedMotion: false };

export function AccessibilityWidget() {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(defaults);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setPreferences({ ...defaults, ...JSON.parse(saved) });
    } catch {
      // Preferences are an enhancement; the page remains usable without storage.
    }
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--text-scale", String(preferences.scale));
    document.body.classList.toggle("high-contrast", preferences.contrast);
    document.body.classList.toggle("reduce-motion", preferences.reducedMotion);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); } catch { /* no-op */ }
  }, [preferences]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const update = (next: Partial<Preferences>) => setPreferences((current) => ({ ...current, ...next }));

  return (
    <>
      <button ref={triggerRef} className="icon-button" aria-expanded={open} aria-controls="accessibility-preferences" aria-label="Open accessibility preferences" title="Accessibility preferences" onClick={() => setOpen((value) => !value)}>
        <Accessibility size={18} aria-hidden="true" />
      </button>
      {/* A filtered header creates a containing block for fixed descendants. */}
      {open && createPortal(
        <section id="accessibility-preferences" className="public-accessibility-panel" aria-label="Accessibility preferences">
          <button ref={closeRef} className="panel-close" aria-label="Close accessibility preferences" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}><X size={17} /></button>
          <h2>Accessibility preferences</h2>
          <p className="small">Your display preferences are saved on this device.</p>
          <div className="accessibility-controls">
            <button onClick={() => update({ scale: Math.min(1.25, Number((preferences.scale + 0.1).toFixed(1))) })}><Plus size={14} /> Larger text</button>
            <button onClick={() => update({ scale: Math.max(0.9, Number((preferences.scale - 0.1).toFixed(1))) })}><Minus size={14} /> Smaller text</button>
            <button aria-pressed={preferences.contrast} onClick={() => update({ contrast: !preferences.contrast })}>{preferences.contrast ? "Normal contrast" : "High contrast"}</button>
            <button aria-pressed={preferences.reducedMotion} onClick={() => update({ reducedMotion: !preferences.reducedMotion })}>{preferences.reducedMotion ? "Motion on" : "Reduce motion"}</button>
          </div>
          <button className="button secondary small-button" style={{ marginTop: 10, width: "100%" }} onClick={() => update(defaults)}><RotateCcw size={14} /> Reset</button>
        </section>,
        document.body,
      )}
    </>
  );
}

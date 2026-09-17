"use client";

import { Accessibility, Minus, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "iet-accessibility-preferences";
type Preferences = { scale: number; contrast: boolean; reducedMotion: boolean };
const defaults: Preferences = { scale: 1, contrast: false, reducedMotion: false };

export function AccessibilityWidget() {
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

  const update = (next: Partial<Preferences>) => setPreferences((current) => ({ ...current, ...next }));

  return (
    <>
      <button className="icon-button" aria-label="Open accessibility preferences" title="Accessibility preferences" onClick={() => setOpen((value) => !value)}>
        <Accessibility size={18} aria-hidden="true" />
      </button>
      {open && (
        <section className="accessibility-panel" aria-label="Accessibility preferences">
          <button className="panel-close" aria-label="Close accessibility preferences" onClick={() => setOpen(false)}><X size={17} /></button>
          <h2>Accessibility preferences</h2>
          <p className="small">Preferences are saved on this device. Content editors must still provide accessible source material.</p>
          <div className="accessibility-controls">
            <button onClick={() => update({ scale: Math.min(1.25, Number((preferences.scale + 0.1).toFixed(1))) })}><Plus size={14} /> Larger text</button>
            <button onClick={() => update({ scale: Math.max(0.9, Number((preferences.scale - 0.1).toFixed(1))) })}><Minus size={14} /> Smaller text</button>
            <button onClick={() => update({ contrast: !preferences.contrast })}>{preferences.contrast ? "Normal contrast" : "High contrast"}</button>
            <button onClick={() => update({ reducedMotion: !preferences.reducedMotion })}>{preferences.reducedMotion ? "Motion on" : "Reduce motion"}</button>
          </div>
          <button className="button secondary small-button" style={{ marginTop: 10, width: "100%" }} onClick={() => update(defaults)}><RotateCcw size={14} /> Reset</button>
        </section>
      )}
    </>
  );
}

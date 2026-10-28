import { ToggleButton, ToggleButtonGroup } from "react-bootstrap";

import type { SourceFormat, StorageFormat, StorageFormatKey } from "../api/types";
import { formatBytes } from "../lib/format";

/** Marks a lossless format. */
export function LosslessBadge() {
  return (
    <span className="lossless-badge" title="Lossless: bit-perfect, no quality lost">
      <i className="bi bi-soundwave" />
      Lossless
    </span>
  );
}

export function StorageFormatPicker({
  name,
  formats,
  value,
  onChange,
}: {
  name: string;
  formats: StorageFormat[];
  value: StorageFormatKey | "";
  onChange: (value: StorageFormatKey) => void;
}) {
  return (
    <ToggleButtonGroup type="radio" name={name} value={value} onChange={onChange} className="flex-wrap">
      {formats.map((format) => (
        <ToggleButton key={format.key} id={`${name}-${format.key}`} value={format.key} variant="outline-secondary" size="sm" title={format.description}>
          {format.label}
          {format.lossless && <i className="bi bi-soundwave lossless-icon ms-1" aria-label="lossless" />}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

/** The audio streams of a YouTube video as a radio list. */
export function SourceFormatList({ formats, value, onChange }: { formats: SourceFormat[]; value: string; onChange: (id: string) => void }) {
  const languages = new Set(formats.map((format) => format.language).filter(Boolean));
  return (
    <div className="format-list" role="radiogroup" aria-label="Download format">
      {formats.map((format) => (
        <label key={format.id} className={`format-option ${value === format.id ? "selected" : ""}`}>
          <input type="radio" name="source-format" className="form-check-input" checked={value === format.id} onChange={() => onChange(format.id)} />
          <span className="fw-semibold">{format.label}</span>
          <span className="small text-body-secondary text-nowrap">
            {format.bitrate ? `${format.bitrate} kbit/s` : ""}
            {format.sample_rate ? ` · ${format.sample_rate / 1000} kHz` : ""}
            {languages.size > 1 && format.language ? ` · ${format.language}` : ""}
          </span>
          {format.lossless && <LosslessBadge />}
          <span className="ms-auto small text-body-tertiary text-nowrap">{format.size ? formatBytes(format.size) : ""}</span>
        </label>
      ))}
    </div>
  );
}

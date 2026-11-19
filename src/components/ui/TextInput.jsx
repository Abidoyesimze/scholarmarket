"use client";

import { useId } from "react";

export default function TextInput({
  label,
  error,
  helpText,
  className = "",
  inputClassName = "",
  wrapperClassName = "",
  ...props
}) {
  const id = useId();
  const inputId = props.id || id;
  const errorId = `${inputId}-error`;
  const helpId = `${inputId}-help`;
  const describedBy = [helpText ? helpId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  const commonInputClasses = [
    "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100",
    inputClassName,
  ].join(" ");

  const field = (
    <input
      {...props}
      id={inputId}
      aria-invalid={error ? "true" : undefined}
      aria-describedby={describedBy}
      className={commonInputClasses}
    />
  );

  if (!label) return field;

  return (
    <label className={['block text-sm font-medium text-slate-700', wrapperClassName].join(' ')}>
      <span className="mb-2 block">{label}</span>
      {field}
      {helpText && !error && <span id={helpId} className="mt-1 text-xs text-slate-500">{helpText}</span>}
      {error && <span id={errorId} role="alert" aria-live="polite" className="mt-1 text-xs text-red-600">{error}</span>}
    </label>
  );
}

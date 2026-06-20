import { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

export function Input({ label, error, className = "", id, ...props }: Props) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-xs font-bold text-ink-muted">
          {label}
        </label>
      )}
      <input
        id={id}
        className={`h-10 px-3 rounded-xl border border-border-default bg-white text-sm text-ink-primary
          focus:outline-none focus:ring-2 focus:ring-accent-green/40 focus:border-accent-green
          disabled:opacity-50 ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-accent-red">{error}</p>}
    </div>
  );
}

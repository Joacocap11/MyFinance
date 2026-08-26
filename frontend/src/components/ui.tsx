import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { AlertCircle, Inbox, LoaderCircle, RotateCcw } from "lucide-react";

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger";
}) {
  return (
    <button
      type={type}
      className={`button button--${variant} ${className}`}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`field ${className}`}>
      <span className="field__label">{label}</span>
      {children}
      {hint && !error ? <span className="field__hint">{hint}</span> : null}
      {error ? (
        <span className="field__error" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`} {...props} />;
}

export function Select({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`input select ${className}`} {...props}>
      {children}
    </select>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? "is-selected" : ""}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? (
          <p className="page-header__description">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}

export function LoadingState({
  rows = 3,
  label = "Cargando",
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <div className="skeleton-stack" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton" key={index} />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function InlineLoading({ label = "Guardando…" }: { label?: string }) {
  return (
    <span className="inline-loading">
      <LoaderCircle size={16} aria-hidden="true" /> {label}
    </span>
  );
}

export function ErrorState({
  message,
  onRetry,
  compact = false,
}: {
  message: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`state state--error ${compact ? "state--compact" : ""}`}
      role="alert"
    >
      <AlertCircle aria-hidden="true" />
      <div>
        <strong>No pudimos cargar esta información</strong>
        <p>{message}</p>
      </div>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          <RotateCcw size={16} /> Reintentar
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  actions,
  compact = false,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`state state--empty ${compact ? "state--compact" : ""}`}>
      <Inbox aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
        {actions ? <div className="state__actions">{actions}</div> : null}
      </div>
    </div>
  );
}

export function StatusPill({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning" | "danger";
  children: ReactNode;
}) {
  return <span className={`status status--${tone}`}>{children}</span>;
}

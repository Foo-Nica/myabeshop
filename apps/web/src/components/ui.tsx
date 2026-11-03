import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'whatsapp';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-900 disabled:bg-brand-700/50',
  secondary: 'bg-white text-ink border border-line hover:bg-canvas disabled:opacity-50',
  ghost: 'text-brand-700 hover:bg-brand-50 disabled:opacity-50',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-50',
  whatsapp: 'bg-[#1fa855] text-white hover:bg-[#178a45] disabled:opacity-50',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; block?: boolean }>(
  function Button({ variant = 'primary', loading, block, className, children, disabled, ...props }, ref) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cx(
          'tap inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[15px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
          VARIANTS[variant],
          block && 'w-full',
          className,
        )}
        {...props}
      >
        {loading && <Spinner />}
        {children}
      </button>
    );
  },
);

export function LinkButton({ href, variant = 'primary', className, children, block, ...rest }: { href: string; variant?: Variant; className?: string; children: ReactNode; block?: boolean; target?: string; rel?: string; onClick?: () => void }) {
  return (
    <a
      href={href}
      className={cx('tap inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[15px] font-semibold transition-colors', VARIANTS[variant], block && 'w-full', className)}
      {...rest}
    >
      {children}
    </a>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cx('inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)} />;
}

export function Label({ htmlFor, children, hint }: { htmlFor?: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-medium text-ink">
      <span>{children}</span>
      {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
    </label>
  );
}

const fieldClass =
  'tap w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-ink placeholder:text-muted/70 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-canvas';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={cx(fieldClass, invalid && 'border-red-500', className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select(
  { className, invalid, children, ...props },
  ref,
) {
  return (
    <select ref={ref} aria-invalid={invalid || undefined} className={cx(fieldClass, 'appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9', invalid && 'border-red-500', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%235d6b66'%3E%3Cpath d='M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4z'/%3E%3C/svg%3E\")" }} {...props}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cx(fieldClass, 'min-h-24', className)} {...props} />;
});

export function Field({ label, htmlFor, error, hint, children }: { label: ReactNode; htmlFor?: string; error?: string | null; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <Label htmlFor={htmlFor} hint={hint}>
        {label}
      </Label>
      {children}
      {error && (
        <p role="alert" className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-2xl border border-line bg-white p-4 sm:p-5', className)}>{children}</div>;
}

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', className)}>{children}</span>;
}

export function Alert({ tone = 'error', children }: { tone?: 'error' | 'info' | 'success'; children: ReactNode }) {
  const tones = { error: 'bg-red-50 text-red-800 border-red-200', info: 'bg-sky-50 text-sky-900 border-sky-200', success: 'bg-emerald-50 text-emerald-900 border-emerald-200' };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('rounded-xl border px-3.5 py-2.5 text-sm', tones[tone])}>
      {children}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Amount input in major units for zero-decimal currencies (FCFA). */
export function MoneyInput({ value, onChange, currency = 'XOF', id, placeholder, invalid }: { value: number | null | undefined; onChange: (v: number | null) => void; currency?: string; id?: string; placeholder?: string; invalid?: boolean }) {
  const suffix = currency === 'XOF' || currency === 'XAF' ? 'F CFA' : currency;
  return (
    <div className="relative">
      <Input
        id={id}
        inputMode="numeric"
        placeholder={placeholder}
        invalid={invalid}
        value={value == null ? '' : new Intl.NumberFormat('fr-FR').format(value).replace(/ | /g, ' ')}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '');
          onChange(digits === '' ? null : Number(digits));
        }}
        className="pr-16"
      />
      <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-muted">{suffix}</span>
    </div>
  );
}

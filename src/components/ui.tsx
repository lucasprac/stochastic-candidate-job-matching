import React, { useEffect, useRef } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export function SubqMosaicIcon({
  size = 32,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect x="4" y="4" width="120" height="120" rx="28" fill="#2E4DA7" />
      <line x1="45" y1="70" x2="83" y2="70" stroke="#FFFFFF" strokeWidth="2.8" strokeLinecap="round" />
      <g fill="#3B4450">
        <path d="M62 68.6 C62 66.5 64 65.5 66 65.5 C68 65.5 70 66.5 70 68.6 Z" />
        <path d="M65 66 L69 57.5" stroke="#3B4450" strokeWidth="2.8" strokeLinecap="round" />
        <circle cx="71.2" cy="54.8" r="3.6" fill="#4E5866" />
      </g>
      <path
        d="M27.5 57.5 L31.5 77.5 C32.3 81.5 34.5 83 38.5 83 L43.5 83 C45.8 83 47 84.5 47.8 87.5 L49.5 93.5"
        stroke="#FFFFFF"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M100.5 57.5 L96.5 77.5 C95.7 81.5 93.5 83 89.5 83 L84.5 83 C82.2 83 81 84.5 80.2 87.5 L78.5 93.5"
        stroke="#FFFFFF"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g>
        <path
          d="M40 37 C45.5 37 49.5 40.5 49.5 45 L51 47.2 L49 48.2 C48.8 51.2 46.5 53 43.5 53 L41.5 53 L41.5 55 L36.5 53.5 C36.5 49 36.5 40 40 37 Z"
          fill="#FFFFFF"
        />
        <path
          d="M32.5 51.5 C32.5 41 36.5 34.5 43.5 34.5 C48.2 34.5 50.8 37.8 51 41.5 C48.5 41.2 46.8 39.8 45.2 38.5 C43.5 41.5 41 42.5 38.8 42.5 C37.2 42.5 36.5 43.8 36.5 45.2 C36.5 46.8 37.8 47.5 39.2 47.5 L39.2 49.5 C37.8 50.5 36.2 51.8 35.8 53 C34.2 52.8 33 52.2 32.5 51.5 Z"
          fill="#3B4450"
        />
        <path
          d="M35.5 54.5 C39.5 54 43.5 55.8 46.5 59.5 L51.5 64.5 L56.5 60.5 L59.5 63.8 L52.8 70.2 C51.2 71.6 48.8 71.6 47.2 70.2 L44.5 67.8 L45.5 72.5 L54.2 74.2 C56.8 74.8 58.2 76.8 58.6 79.5 L60.2 93.5 L53.2 93.5 L51 81.5 L38.5 81.5 C34.8 81.5 32.8 79.2 32.2 75.5 L30.2 61.5 C29.8 57.5 32 55 35.5 54.5 Z"
          fill="#3B4450"
        />
        <path d="M39.5 58.5 L44.2 63.8" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M56.2 60.2 C57.8 58.5 60.5 58.8 61.5 60.8 C62.2 62.2 61.2 64.2 59.5 64.5 L56.5 63.5 Z" fill="#FFFFFF" />
        <path d="M56.5 55.2 L61 63.2" stroke="#3B4450" strokeWidth="2.8" strokeLinecap="round" />
        <circle cx="55.2" cy="52.8" r="3.4" fill="#4E5866" />
      </g>
      <g>
        <path
          d="M86 38 C80.5 38 77.5 41 77.5 45 L75.5 47.5 L77.5 48.3 C77.6 51.5 79.5 53.5 82.8 53.5 L84.5 53.5 L84.5 55.5 L89.5 53.5 C89.5 49 89.5 41 86 38 Z"
          fill="#FFFFFF"
        />
        <path d="M77.5 49.2 L80.5 49.2 C80.2 50.8 78.6 51.2 77.5 50.2 Z" fill="#3B4450" />
        <path
          d="M77 38.5 C77 35.5 80 34.5 84.5 34.5 C89.2 34.5 92.2 37.8 92.2 42.5 C92.2 46.2 91 49.5 89.5 51.5 L88 47.5 C89.2 47.2 89.8 46.2 89.8 45 C89.8 43.8 89 43 87.8 43 C86.5 43 85.8 44 85.5 45.2 L84.2 45.2 C83.8 42.5 82.2 41 79.5 40.8 C78 40.6 77 39.8 77 38.5 Z"
          fill="#3B4450"
        />
        <path
          d="M89.5 54.5 C93.5 54.5 95.8 57.2 95.5 61.5 L94.2 75.5 C93.8 79.2 91.8 81.5 88 81.5 L75.5 81.5 L73.5 93.5 L66.5 93.5 L68.2 79.5 C68.6 76.8 70 74.8 72.5 74.2 L81.5 72.5 L82.5 69.2 L76 69.2 L76 65.5 L83.5 65.5 L84.8 59.5 C85.5 56.2 87.2 54.5 89.5 54.5 Z"
          fill="#3B4450"
        />
        <path d="M72 68.6 C72 66.8 74 65.5 76.2 65.5 L77.8 65.5 L77.8 68.6 Z" fill="#FFFFFF" />
        <path
          d="M89.5 60.5 L89 66.2 C88.9 67.8 87.8 68.8 86.2 68.8 L79.5 68.8"
          stroke="#FFFFFF"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line x1="85.2" y1="60.5" x2="84.5" y2="65.5" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function StepBadge({
  step,
  tone,
  className = '',
}: {
  step: number;
  tone: 'blue' | 'orange' | 'green' | 'gold';
  className?: string;
}) {
  const toneStyles: Record<'blue' | 'orange' | 'green' | 'gold', React.CSSProperties> = {
    blue: {
      background: 'var(--accent-blue-soft)',
      color: 'var(--accent-blue)',
      borderColor: 'var(--accent-blue)',
    },
    orange: {
      background: 'var(--accent-orange-soft)',
      color: 'var(--accent-orange)',
      borderColor: 'var(--accent-orange)',
    },
    green: {
      background: 'var(--accent-green-soft)',
      color: 'var(--accent-green)',
      borderColor: 'var(--accent-green)',
    },
    gold: {
      background: 'var(--accent-gold-soft)',
      color: 'var(--sq-content-primary)',
      borderColor: 'var(--accent-gold)',
    },
  };

  return (
    <span
      style={toneStyles[tone]}
      className={`inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full border px-1.5 font-mono text-[11px] font-medium tabular-nums ${className}`}
    >
      {String(step).padStart(2, '0')}
    </span>
  );
}

export function SurfaceCard({
  className = '',
  focusTone = 'none',
  children,
  ...rest
}: {
  className?: string;
  focusTone?: 'blue' | 'orange' | 'green' | 'none';
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const toneClass =
    focusTone === 'blue'
      ? 'sq-card--blue'
      : focusTone === 'orange'
        ? 'sq-card--orange'
        : focusTone === 'green'
          ? 'sq-card--green'
          : '';

  return (
    <div className={`sq-card ${toneClass} ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function PillButton({
  active = false,
  variant = 'default',
  className = '',
  type = 'button',
  children,
  ...rest
}: {
  active?: boolean;
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  className?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  let variantClasses = '';

  if (variant === 'primary') {
    variantClasses =
      'rounded-[2px] border border-[var(--sq-content-primary)] bg-[var(--accent-gold)] text-[var(--ink)] font-mono font-medium hover:shadow-[3px_3px_0_var(--sq-content-primary)] hover:-translate-x-[1px] hover:-translate-y-[1px] active:translate-x-0 active:translate-y-0 active:shadow-[1px_1px_0_var(--sq-content-primary)]';
  } else if (variant === 'danger') {
    variantClasses =
      'rounded-full border border-[var(--accent-red)] bg-[var(--accent-red-soft)] text-[var(--accent-red)] hover:opacity-90';
  } else if (variant === 'ghost') {
    variantClasses = active
      ? 'rounded-full border border-[var(--sq-rule-strong)] bg-[var(--sq-surface-secondary)] text-[var(--sq-content-primary)]'
      : 'rounded-full border border-transparent bg-transparent text-[var(--sq-content-secondary)] hover:bg-[var(--sq-ghost)] hover:text-[var(--sq-content-primary)]';
  } else {
    variantClasses = active
      ? 'rounded-full border border-[var(--sq-content-primary)] bg-[var(--sq-content-primary)] text-[var(--sq-surface-primary)]'
      : 'rounded-full border border-[var(--sq-rule-strong)] bg-[var(--sq-surface-secondary)] text-[var(--sq-content-primary)] hover:border-[var(--sq-content-primary)]';
  }

  return (
    <button
      type={type}
      className={`inline-flex cursor-pointer items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-blue)] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:transform-none ${variantClasses} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ProbabilityBar({
  label,
  probability,
  isTop = false,
  sublabel,
  muted = false,
}: {
  label: string;
  probability: number;
  isTop?: boolean;
  sublabel?: string;
  muted?: boolean;
}) {
  const clamped = Number.isFinite(probability) ? Math.min(1, Math.max(0, probability)) : 0;
  const pct = clamped * 100;

  return (
    <div className={`space-y-1 ${muted ? 'opacity-55' : ''}`}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <div className="min-w-0">
          <span
            className={`truncate ${
              isTop ? 'font-semibold text-[var(--sq-content-primary)]' : 'text-[var(--sq-content-primary)]'
            }`}
          >
            {label}
          </span>
          {sublabel ? (
            <span className="ml-2 text-[11px] text-[var(--sq-content-secondary)]">{sublabel}</span>
          ) : null}
        </div>
        <span
          className={`shrink-0 font-mono text-[11px] tabular-nums ${
            isTop ? 'font-medium text-[var(--sq-content-primary)]' : 'text-[var(--sq-content-secondary)]'
          }`}
        >
          {pct.toFixed(1)}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className="h-2 w-full overflow-hidden rounded-full bg-[var(--sq-surface-secondary)]"
      >
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{
            width: `${pct}%`,
            background: isTop
              ? 'var(--accent-orange)'
              : muted
                ? 'var(--sq-content-secondary)'
                : 'var(--accent-blue)',
          }}
        />
      </div>
    </div>
  );
}

export function AlertBanner({
  tone,
  title,
  children,
  onDismiss,
}: {
  tone: 'info' | 'warning' | 'error' | 'success';
  title?: string;
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  const config: Record<
    'info' | 'warning' | 'error' | 'success',
    {
      icon: React.ComponentType<{ className?: string }>;
      bg: string;
      border: string;
      accent: string;
    }
  > = {
    info: {
      icon: Info,
      bg: 'var(--accent-blue-soft)',
      border: 'var(--accent-blue)',
      accent: 'var(--accent-blue)',
    },
    warning: {
      icon: AlertTriangle,
      bg: 'var(--accent-gold-soft)',
      border: 'var(--accent-gold)',
      accent: 'var(--sq-content-primary)',
    },
    error: {
      icon: AlertCircle,
      bg: 'var(--accent-red-soft)',
      border: 'var(--accent-red)',
      accent: 'var(--accent-red)',
    },
    success: {
      icon: CheckCircle2,
      bg: 'var(--accent-green-soft)',
      border: 'var(--accent-green)',
      accent: 'var(--accent-green)',
    },
  };

  const { icon: Icon, bg, border, accent } = config[tone];

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      style={{ background: bg, borderColor: border }}
      className="flex items-start gap-3 rounded-[10px] border px-3.5 py-2.5 text-xs leading-relaxed text-[var(--sq-content-primary)]"
    >
      <span style={{ color: accent }} className="mt-0.5 shrink-0">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className="text-[var(--sq-content-primary)]">{children}</div>
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fechar aviso"
          className="inline-flex min-h-7 min-w-7 shrink-0 cursor-pointer items-center justify-center rounded p-1 text-[var(--sq-content-secondary)] hover:bg-[var(--sq-ghost)] hover:text-[var(--sq-content-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-blue)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export function DialogShell({
  open,
  onClose,
  titleId,
  title,
  subtitle,
  maxWidthClass = 'max-w-xl',
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  titleId: string;
  title: string;
  subtitle?: string;
  maxWidthClass?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const openRef = useRef(open);
  const onCloseRef = useRef(onClose);
  openRef.current = open;
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) {
        try {
          dialog.showModal();
        } catch {
          // Ignore if dialog is not yet connected
        }
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Safari fallback for browsers without native HTMLDialogElement.closedBy
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const handleBackdropClick = (event: MouseEvent) => {
        if (event.target !== dialog) return;
        // Ignore non-pointer keyboard activations
        if (event.detail === 0 && event.clientX === 0 && event.clientY === 0) return;

        const rect = dialog.getBoundingClientRect();
        const isOutside =
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom;

        if (isOutside && dialog.open) {
          dialog.close();
        }
      };

      dialog.addEventListener('click', handleBackdropClick);
      return () => dialog.removeEventListener('click', handleBackdropClick);
    }
  }, []);

  return (
    <dialog
      ref={ref}
      closedby="any"
      aria-labelledby={titleId}
      className={`sq-dialog ${maxWidthClass}`}
      onCancel={(event) => {
        event.preventDefault();
        if (openRef.current) {
          onCloseRef.current();
        }
      }}
      onClose={() => {
        if (openRef.current) {
          onCloseRef.current();
        }
      }}
    >
      <div className="flex max-h-[min(90dvh,880px)] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--sq-rule)] px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-base font-bold text-[var(--sq-content-primary)]">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-1 text-xs text-[var(--sq-content-secondary)]">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela"
            className="shrink-0 cursor-pointer rounded-md p-1.5 text-[var(--sq-content-secondary)] transition hover:bg-[var(--sq-ghost)] hover:text-[var(--sq-content-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-blue)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--sq-rule)] bg-[var(--sq-surface-secondary)] px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}

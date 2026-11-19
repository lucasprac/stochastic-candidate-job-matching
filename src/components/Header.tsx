import { ExternalLink, Moon, Settings, Sun } from 'lucide-react';
import type { ColorSchemePreference } from '../lib/apiKey';
import { PROJECT_META } from '../lib/projectMeta';
import { SubqMosaicIcon } from './ui';

export type AppMode = 'stochastic' | 'playground';

function GithubMark({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
    </svg>
  );
}

export function Header({
  mode,
  onModeChange,
  apiKeyStatus,
  isStaticHost,
  colorScheme,
  onToggleColorScheme,
  onOpenApiKeyDialog,
}: {
  mode: AppMode;
  onModeChange: (m: AppMode) => void;
  apiKeyStatus: 'custom' | 'server' | 'missing';
  isStaticHost: boolean;
  colorScheme: ColorSchemePreference;
  onToggleColorScheme: () => void;
  onOpenApiKeyDialog: () => void;
}) {
  const isDarkActive =
    colorScheme === 'dark' ||
    (colorScheme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const keyBadge =
    apiKeyStatus === 'custom'
      ? {
          label: 'Acesso configurado',
          dotColor: 'var(--accent-green)',
          borderColor: 'var(--accent-green)',
          bg: 'var(--accent-green-soft)',
        }
      : apiKeyStatus === 'server' || isStaticHost
        ? {
            label: 'Configurações',
            dotColor: isStaticHost ? 'var(--accent-green)' : 'var(--accent-blue)',
            borderColor: 'var(--sq-rule-strong)',
            bg: 'var(--sq-surface-secondary)',
          }
        : {
            label: 'Configurar acesso',
            dotColor: 'var(--accent-orange)',
            borderColor: 'var(--accent-orange)',
            bg: 'var(--accent-orange-soft)',
          };

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--sq-rule)] bg-[var(--sq-surface-primary)]/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        {/* Brand lockup */}
        <a
          href="#top"
          className="flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-blue)]"
        >
          <div className="flex h-8 w-8 items-center justify-center">
            <SubqMosaicIcon size={32} />
          </div>
          <div className="flex flex-col">
            <span className="font-display text-[18px] font-bold leading-tight tracking-tight text-[var(--sq-content-primary)]">
              {PROJECT_META.name}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--sq-content-secondary)]">
              {PROJECT_META.subtitle}
            </span>
          </div>
        </a>

        {/* Navigation + Utilities */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          <nav
            role="tablist"
            aria-label="Modo de avaliação"
            className="inline-flex max-w-full flex-wrap rounded-full border border-[var(--sq-rule-strong)] bg-[var(--sq-surface-secondary)] p-0.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'stochastic'}
              onClick={() => onModeChange('stochastic')}
              className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-blue)] ${
                mode === 'stochastic'
                  ? 'bg-[var(--sq-content-primary)] text-[var(--sq-surface-primary)] shadow-xs'
                  : 'text-[var(--sq-content-secondary)] hover:text-[var(--sq-content-primary)]'
              }`}
            >
              Avaliação de Candidatos
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'playground'}
              onClick={() => onModeChange('playground')}
              className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-blue)] ${
                mode === 'playground'
                  ? 'bg-[var(--sq-content-primary)] text-[var(--sq-surface-primary)] shadow-xs'
                  : 'text-[var(--sq-content-secondary)] hover:text-[var(--sq-content-primary)]'
              }`}
            >
              Triagem Rápida
            </button>
          </nav>

          <a
            href={PROJECT_META.repoUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Abrir repositório no GitHub"
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--sq-rule-strong)] bg-[var(--sq-surface-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--sq-content-primary)] transition hover:bg-[var(--sq-surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-blue)]"
          >
            <GithubMark className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">GitHub</span>
            <ExternalLink className="h-3 w-3 text-[var(--sq-content-secondary)]" />
          </a>

          <button
            type="button"
            onClick={onToggleColorScheme}
            aria-label={isDarkActive ? 'Alternar para modo claro' : 'Alternar para modo escuro'}
            title={isDarkActive ? 'Modo claro' : 'Modo escuro'}
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-[var(--sq-rule-strong)] bg-[var(--sq-surface-secondary)] text-[var(--sq-content-primary)] transition hover:bg-[var(--sq-surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-blue)]"
          >
            {isDarkActive ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            onClick={onOpenApiKeyDialog}
            style={{
              borderColor: keyBadge.borderColor,
              background: keyBadge.bg,
            }}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium text-[var(--sq-content-primary)] transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-blue)]"
          >
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: keyBadge.dotColor }}
            />
            <Settings className="h-3.5 w-3.5 text-[var(--sq-content-secondary)]" />
            <span className="hidden md:inline">{keyBadge.label}</span>
          </button>
        </div>
      </div>
    </header>
  );
}

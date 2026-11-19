import { ExternalLink, Scale } from 'lucide-react';
import { PROJECT_META } from '../lib/projectMeta';
import { SubqMosaicIcon } from './ui';

export function Footer() {
  return (
    <footer className="mt-12 border-t border-[var(--sq-rule)] bg-[var(--sq-surface-raised)]/70">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center">
            <SubqMosaicIcon size={28} />
          </div>
          <div className="space-y-1">
            <p className="font-display text-sm font-bold text-[var(--sq-content-primary)]">
              {PROJECT_META.name}{' '}
              <span className="font-sans text-xs font-normal text-[var(--sq-content-secondary)]">
                · {PROJECT_META.subtitle}
              </span>
            </p>
            <p className="text-xs text-[var(--sq-content-secondary)]">
              © {PROJECT_META.year} {PROJECT_META.author}. Distribuído sob a{' '}
              <a
                href={PROJECT_META.licenseUrl}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-[var(--sq-rule-strong)] underline-offset-2 transition hover:text-[var(--sq-content-primary)]"
              >
                Licença MIT
              </a>
              .
            </p>
          </div>
        </div>

        <nav
          aria-label="Links do projeto"
          className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--sq-content-secondary)]"
        >
          <a
            href={PROJECT_META.repoUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 transition hover:text-[var(--sq-content-primary)]"
          >
            <span>Repositório GitHub</span>
            <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href={PROJECT_META.methodologyUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 transition hover:text-[var(--sq-content-primary)]"
          >
            <span>Metodologia</span>
            <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href={PROJECT_META.issuesUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 transition hover:text-[var(--sq-content-primary)]"
          >
            <span>Issues</span>
            <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href={PROJECT_META.licenseUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-[var(--sq-rule)] bg-[var(--sq-surface-primary)] px-2.5 py-0.5 font-mono text-[11px] text-[var(--sq-content-primary)] transition hover:border-[var(--sq-rule-strong)]"
          >
            <Scale className="h-3 w-3 text-[var(--sq-content-secondary)]" />
            <span>MIT</span>
          </a>
        </nav>
      </div>
    </footer>
  );
}

import { ArrowDownRight, BookOpen, ExternalLink, Scale, ShieldCheck, Sparkles } from 'lucide-react';
import { PROJECT_META } from '../lib/projectMeta';

export function ProjectHero({
  isStaticHost,
  proxyDeployment,
  onExploreDemo,
}: {
  isStaticHost: boolean;
  proxyDeployment: 'local' | 'hosted';
  onExploreDemo: () => void;
}) {
  const hostingLabel = isStaticHost
    ? 'Demo Interativa · Hospedagem Estática'
    : proxyDeployment === 'hosted'
      ? 'Demo Online + Proxy API'
      : 'Ambiente Local + Proxy API';
  return (
    <section
      aria-label="Visão geral do projeto"
      className="mb-7 overflow-hidden rounded-2xl border border-[var(--sq-rule)] bg-[var(--sq-surface-raised)]"
    >
      <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:items-center">
        {/* Left: Editorial headline + CTAs */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--sq-rule-strong)] bg-[var(--sq-surface-secondary)] px-2.5 py-0.5 text-[var(--sq-content-primary)]">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-[var(--accent-green)]"
              />
              Open Source · MIT License
            </span>
            <span className="text-[var(--sq-content-secondary)]">
              {hostingLabel}
            </span>
          </div>

          <div className="space-y-2.5">
            <h1 className="font-display text-2xl font-bold leading-tight tracking-tight text-[var(--sq-content-primary)] sm:text-[32px]">
              Decisões de contratação com rigor estocástico e transparência de banca.
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-[var(--sq-content-secondary)]">
              <strong className="font-semibold text-[var(--sq-content-primary)]">
                {PROJECT_META.name}
              </strong>{' '}
              combina matrizes de crença multiavaliador, modelagem explícita de lacunas de
              evidência e simulação Monte Carlo para medir consenso, risco de desacordo e ranking
              probabilístico de candidatos — direto no navegador.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={onExploreDemo}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-[var(--sq-content-primary)] px-4 py-2 text-xs font-semibold text-[var(--sq-surface-primary)] transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-blue)]"
            >
              <span>Ver exemplo pronto</span>
              <ArrowDownRight className="h-3.5 w-3.5" />
            </button>

            <a
              href={PROJECT_META.repoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--sq-rule-strong)] bg-[var(--sq-surface-primary)] px-4 py-2 text-xs font-medium text-[var(--sq-content-primary)] transition hover:bg-[var(--sq-surface-secondary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-blue)]"
            >
              <span>Código no GitHub</span>
              <ExternalLink className="h-3.5 w-3.5 text-[var(--sq-content-secondary)]" />
            </a>

            <a
              href={PROJECT_META.methodologyUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium text-[var(--sq-content-secondary)] transition hover:text-[var(--sq-content-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-blue)]"
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>Metodologia</span>
            </a>
          </div>
        </div>

        {/* Right: 3 compact pillar tiles */}
        <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-1">
          <div className="flex items-start gap-3 rounded-xl border border-[var(--sq-rule)] bg-[var(--sq-surface-primary)]/75 p-3.5">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-blue-soft)] text-[var(--accent-blue)]">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--sq-content-primary)]">
                Crença &amp; Incerteza Explícita
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--sq-content-secondary)]">
                Separa desempenho observado de lacunas no currículo em vez de forçar notas médias.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-[var(--sq-rule)] bg-[var(--sq-surface-primary)]/75 p-3.5">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-gold-soft)] text-[var(--accent-gold)]">
              <Scale className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--sq-content-primary)]">
                Consenso Estocástico em Tempo Real
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--sq-content-secondary)]">
                Ajuste pesos, rigor (α) e matrizes de crença com recálculo Monte Carlo imediato.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-[var(--sq-rule)] bg-[var(--sq-surface-primary)]/75 p-3.5">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-green-soft)] text-[var(--accent-green)]">
              <ShieldCheck className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--sq-content-primary)]">
                100% Client-Side + Proxy Opcional
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--sq-content-secondary)]">
                Motor matemático roda localmente no browser; conecte a API SubQ quando quiser.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  Award,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FlaskConical,
  MessageSquareWarning,
  Printer,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import {
  TIE_TOLERANCE,
  fsum,
  type CandidateEvaluationResult,
  type StochasticEvaluationResult,
} from '../stochastic/consensus';
import type {
  StochasticCandidate,
  StochasticCriterion,
  StochasticEvaluator,
} from '../data/presets';
import { toCsvRow } from '../lib/csv';
import { formatDecimal, formatPercent } from '../lib/format';
import { AlertBanner, PillButton, SurfaceCard } from './ui';

export interface ApiRunTelemetry {
  model: 'subq-snap-1.2';
  elicitationMode: 'score_plus_noul' | 'score_only';
  completedCalls: number;
  totalCalls: number;
  inputTokens: number;
  totalLatencyMs: number;
  executedAt: string;
}

export interface ConsensusResultsProps {
  evaluation: StochasticEvaluationResult;
  sourceMode: 'subq-snap-1.2' | 'synthetic-local';
  elicitationMode?: 'score_plus_noul' | 'score_only';
  apiTelemetry?: ApiRunTelemetry | null;
  vagaTexto: string;
  candidates: StochasticCandidate[];
  criteria: StochasticCriterion[];
  grades: string[];
  evaluators: StochasticEvaluator[];
  originalMatrices: number[][][][];
  workingMatrices: number[][][][];
  hasReviewerEdits: boolean;
  isStale?: boolean;
  onOpenBeliefModal: () => void;
  onRestoreOriginals: () => void;
}

function getHeatmapColors(distance: number): {
  bg: string;
  border: string;
  label: string;
} {
  if (distance < 0.2) {
    return {
      bg: 'var(--accent-green-soft)',
      border: 'var(--accent-green)',
      label: 'Alinhados',
    };
  }
  if (distance < 0.45) {
    return {
      bg: 'var(--accent-gold-soft)',
      border: 'var(--accent-gold)',
      label: 'Divergência moderada',
    };
  }
  return {
    bg: 'var(--accent-red-soft)',
    border: 'var(--accent-red)',
    label: 'Alta divergência',
  };
}

function getAgreementBadge(gcr: number): {
  label: string;
  bg: string;
  border: string;
  color: string;
} {
  if (gcr >= 0.75) {
    return {
      label: 'Alto acordo',
      bg: 'var(--accent-green-soft)',
      border: 'var(--accent-green)',
      color: 'var(--accent-green)',
    };
  }
  if (gcr >= 0.4) {
    return {
      label: 'Acordo moderado',
      bg: 'var(--accent-gold-soft)',
      border: 'var(--accent-gold)',
      color: 'var(--sq-content-primary)',
    };
  }
  return {
    label: 'Divergência na banca',
    bg: 'var(--accent-red-soft)',
    border: 'var(--accent-red)',
    color: 'var(--accent-red)',
  };
}

function getGapBadge(ignorance: number): {
  label: string;
  bg: string;
  border: string;
} {
  if (ignorance < 0.2) {
    return {
      label: 'Baixa',
      bg: 'var(--accent-green-soft)',
      border: 'var(--accent-green)',
    };
  }
  if (ignorance < 0.35) {
    return {
      label: 'Moderada',
      bg: 'var(--accent-gold-soft)',
      border: 'var(--accent-gold)',
    };
  }
  return {
    label: 'Alta — investigar',
    bg: 'var(--accent-orange-soft)',
    border: 'var(--accent-orange)',
  };
}

function formatScore100(utility: number): string {
  const clamped = Math.min(100, Math.max(0, utility * 100));
  return `${Math.round(clamped)}`;
}

function computeDisplayRanks(
  rows: CandidateEvaluationResult[],
  metric: 'equal' | 'rankWeighted',
): Map<number, number> {
  const rankMap = new Map<number, number>();
  for (let idx = 0; idx < rows.length; idx += 1) {
    const val =
      metric === 'equal' ? rows[idx].meanUtilityEqual : rows[idx].meanUtilityRankWeighted;
    let rank = 1;
    for (let m = 0; m < rows.length; m += 1) {
      const other =
        metric === 'equal' ? rows[m].meanUtilityEqual : rows[m].meanUtilityRankWeighted;
      if (other > val + TIE_TOLERANCE) {
        rank += 1;
      }
    }
    rankMap.set(rows[idx].index, rank);
  }
  return rankMap;
}

export function ConsensusResults({
  evaluation,
  sourceMode,
  elicitationMode,
  apiTelemetry,
  vagaTexto,
  candidates,
  criteria,
  grades,
  evaluators,
  originalMatrices,
  workingMatrices,
  hasReviewerEdits,
  isStale = false,
  onOpenBeliefModal,
  onRestoreOriginals,
}: ConsensusResultsProps) {
  const { consensus } = evaluation;
  const [sortBy, setSortBy] = useState<'equal' | 'rankWeighted'>('equal');

  const sortedCandidates = useMemo(() => {
    const copy = [...evaluation.candidates];
    copy.sort((a, b) => {
      const diff =
        sortBy === 'equal'
          ? b.meanUtilityEqual - a.meanUtilityEqual
          : b.meanUtilityRankWeighted - a.meanUtilityRankWeighted;
      if (Math.abs(diff) > TIE_TOLERANCE) return diff;
      return a.index - b.index;
    });
    return copy;
  }, [evaluation.candidates, sortBy]);

  const displayRanks = useMemo(
    () => computeDisplayRanks(evaluation.candidates, sortBy),
    [evaluation.candidates, sortBy],
  );

  const evaluatorMeanIgnorance = useMemo(() => {
    return evaluators.map((_, k) => {
      const mat = workingMatrices[k];
      if (!mat) return 0;
      let sumQ = 0;
      let count = 0;
      for (let i = 0; i < mat.length; i += 1) {
        for (let j = 0; j < (mat[i]?.length ?? 0); j += 1) {
          const cell = mat[i][j];
          if (cell) {
            sumQ += Math.max(0, 1 - fsum(cell));
            count += 1;
          }
        }
      }
      return count > 0 ? sumQ / count : 0;
    });
  }, [evaluators, workingMatrices]);

  const overallCompleteness = useMemo(() => {
    if (evaluatorMeanIgnorance.length === 0) return 1;
    const avgIgnorance =
      evaluatorMeanIgnorance.reduce((acc, v) => acc + v, 0) / evaluatorMeanIgnorance.length;
    return Math.min(1, Math.max(0, 1 - avgIgnorance));
  }, [evaluatorMeanIgnorance]);

  const pairDisagreementSummaries = useMemo(() => {
    return consensus.mean_cell_pair_distance.map((pair) => {
      let total = 0;
      let count = 0;
      for (const row of pair.distances) {
        for (const d of row) {
          total += d;
          count += 1;
        }
      }
      return {
        ...pair,
        overallMean: count > 0 ? total / count : 0,
      };
    });
  }, [consensus.mean_cell_pair_distance]);

  const handleExportCsv = () => {
    const headers = [
      'Posição',
      'Candidato',
      'Resumo',
      'Pontuação (0-100)',
      'Faixa Provável',
      'Chance de 1º Lugar',
      'Lacunas no Currículo',
      'Risco de Empate',
    ];
    const rows = sortedCandidates.map((candRes) => {
      const cand = candidates[candRes.index];
      const rankPos = displayRanks.get(candRes.index) ?? candRes.index + 1;
      const score =
        sortBy === 'equal' ? candRes.meanUtilityEqual : candRes.meanUtilityRankWeighted;
      const p05 = sortBy === 'equal' ? candRes.utilityP05 : candRes.utilityP05RankWeighted;
      const p95 = sortBy === 'equal' ? candRes.utilityP95 : candRes.utilityP95RankWeighted;
      const top1Prob =
        sortBy === 'equal'
          ? (candRes.rankProbabilitiesEqual[0] ?? 0)
          : (candRes.rankProbabilitiesRankWeighted[0] ?? 0);
      const tieRate = sortBy === 'equal' ? candRes.tieRate : candRes.tieRateRankWeighted;

      // Name and summary come from pasted CVs (untrusted input): toCsvRow neutralises
      // values that a spreadsheet would run as formulas.
      return toCsvRow([
        `${rankPos}º`,
        cand?.name ?? `Candidato ${candRes.index + 1}`,
        cand?.summary ?? '',
        formatScore100(score),
        `${formatScore100(p05)} a ${formatScore100(p95)} pts`,
        formatPercent(top1Prob, 0),
        formatPercent(candRes.meanIgnorance, 0),
        formatPercent(tieRate, 0),
      ]);
    });

    const csvContent = '\uFEFF' + [toCsvRow(headers), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ranking-candidatos-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const interviewTopics = useMemo(() => {
    const items: Array<{
      candidateName: string;
      criterionLabel: string;
      meanGap: number;
      meanDivergence: number;
      reason: 'gap' | 'divergence' | 'both';
    }> = [];

    for (let i = 0; i < candidates.length; i += 1) {
      for (let j = 0; j < criteria.length; j += 1) {
        let gapSum = 0;
        let gapCount = 0;
        for (let k = 0; k < evaluators.length; k += 1) {
          const cell = workingMatrices[k]?.[i]?.[j];
          if (cell) {
            gapSum += Math.max(0, 1 - fsum(cell));
            gapCount += 1;
          }
        }
        const meanGap = gapCount > 0 ? gapSum / gapCount : 0;

        let divSum = 0;
        let divCount = 0;
        for (const pair of consensus.mean_cell_pair_distance) {
          const d = pair.distances[i]?.[j];
          if (typeof d === 'number' && Number.isFinite(d)) {
            divSum += d;
            divCount += 1;
          }
        }
        const meanDivergence = divCount > 0 ? divSum / divCount : 0;

        const hasHighGap = meanGap >= 0.25;
        const hasHighDiv = meanDivergence >= 0.35;

        if (hasHighGap || hasHighDiv) {
          items.push({
            candidateName: candidates[i]?.name ?? `Candidato ${i + 1}`,
            criterionLabel: criteria[j]?.label ?? `Critério ${j + 1}`,
            meanGap,
            meanDivergence,
            reason: hasHighGap && hasHighDiv ? 'both' : hasHighGap ? 'gap' : 'divergence',
          });
        }
      }
    }

    items.sort((a, b) => Math.max(b.meanGap, b.meanDivergence) - Math.max(a.meanGap, a.meanDivergence));
    return items.slice(0, 8);
  }, [candidates, criteria, evaluators.length, workingMatrices, consensus.mean_cell_pair_distance]);

  const handleExportAuditJson = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      source_mode: sourceMode === 'synthetic-local' ? 'demo' : 'live',
      has_reviewer_edits: hasReviewerEdits,
      config: {
        alpha: consensus.configuration.alpha,
        threshold: consensus.configuration.threshold,
        trials: consensus.configuration.trials,
        seed: consensus.configuration.seed,
        allocation: consensus.configuration.allocation,
        numerical_tolerance: consensus.configuration.numerical_tolerance,
        grades,
        grade_utilities: evaluation.gradeUtilities,
        criteria: criteria.map((c, idx) => ({
          id: c.id,
          label: c.label,
          description: c.description,
          raw_weight: c.weight,
          normalized_weight: evaluation.attributeWeights[idx] ?? 0,
        })),
        evaluators: evaluators.map((e) => ({
          id: e.id,
          name: e.name,
          role: e.role,
          focus_prompt: e.focusPrompt,
        })),
        candidates: candidates.map((c) => ({
          id: c.id,
          name: c.name,
          summary: c.summary,
        })),
        job_description: vagaTexto,
      },
      original_matrices: originalMatrices,
      analyzed_matrices: workingMatrices,
      consensus,
      ranking: {
        methodology_note: evaluation.rankingMethodologyNote,
        evaluator_equal_weights: evaluation.evaluatorEqualWeights,
        evaluator_weights_rank_stability_eq13: evaluation.evaluatorWeightsRankStability,
        evaluator_max_rank_probabilities: evaluation.evaluatorMaxRankProbabilities,
        candidates: evaluation.candidates,
        sensitivity_grid: evaluation.sensitivityGrid,
      },
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-avaliacao-candidatos-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const zeroAccepted = consensus.accepted_count === 0 || consensus.conditional_mean_ci === null;
  const agreementBadge = zeroAccepted
    ? {
        label: 'Abaixo da meta',
        bg: 'var(--accent-red-soft)',
        border: 'var(--accent-red)',
        color: 'var(--accent-red)',
      }
    : getAgreementBadge(consensus.gcr);
  const summaryTone =
    !zeroAccepted && consensus.gcr >= 0.75
      ? {
          border: 'var(--accent-green)',
          bg: 'var(--accent-green-soft)',
          accent: 'var(--accent-green)',
        }
      : !zeroAccepted && consensus.gcr >= 0.4
        ? {
            border: 'var(--accent-gold)',
            bg: 'var(--accent-gold-soft)',
            accent: 'var(--sq-content-primary)',
          }
        : {
            border: 'var(--accent-orange)',
            bg: 'var(--accent-orange-soft)',
            accent: 'var(--accent-orange)',
          };
  const topCandidateRes = sortedCandidates[0];
  const topCandidate = topCandidateRes ? candidates[topCandidateRes.index] : null;
  const topScore = topCandidateRes
    ? sortBy === 'equal'
      ? topCandidateRes.meanUtilityEqual
      : topCandidateRes.meanUtilityRankWeighted
    : 0;
  const topFirstPlaceProb = topCandidateRes
    ? sortBy === 'equal'
      ? (topCandidateRes.rankProbabilitiesEqual[0] ?? 0)
      : (topCandidateRes.rankProbabilitiesRankWeighted[0] ?? 0)
    : 0;

  const candidatesWithHighGaps = useMemo(
    () =>
      evaluation.candidates
        .filter((c) => c.meanIgnorance >= 0.3)
        .map((c) => candidates[c.index]?.name ?? `Candidato ${c.index + 1}`),
    [evaluation.candidates, candidates],
  );

  // Keep elicitationMode / apiTelemetry referenced only for clean typing
  void elicitationMode;
  void apiTelemetry;

  return (
    <div className="min-w-0 space-y-5">
      {/* Source Provenance Banner */}
      {sourceMode === 'subq-snap-1.2' ? (
        <AlertBanner tone="success" title="Avaliação da banca concluída">
          Todos os perfis avaliadores analisaram os currículos com base nos critérios e pesos
          definidos para a vaga.
        </AlertBanner>
      ) : (
        <AlertBanner tone="warning" title="Modo demonstração (exemplo pronto)">
          Estes resultados usam um exemplo pronto para você explorar o painel. Para avaliar seus
          próprios currículos e vagas, preencha os campos acima e clique em{' '}
          <strong>Avaliar Candidatos</strong>.
        </AlertBanner>
      )}

      {isStale ? (
        <AlertBanner tone="warning" title="Informações alteradas após a última avaliação">
          Você editou a vaga, os candidatos, os critérios ou a banca depois desta análise. Clique em{' '}
          <strong>Avaliar Candidatos</strong> novamente para atualizar o resultado.
        </AlertBanner>
      ) : null}

      {hasReviewerEdits ? (
        <AlertBanner tone="info" title="Notas ajustadas manualmente (originais preservadas)">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              O ranking e os indicadores abaixo refletem os ajustes manuais feitos nas notas da
              banca. As avaliações originais continuam salvas.
            </span>
            <PillButton variant="default" onClick={onRestoreOriginals}>
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Restaurar notas originais</span>
            </PillButton>
          </div>
        </AlertBanner>
      ) : null}

      {/* Executive Summary Card for HR */}
      {topCandidate && topCandidateRes ? (
        <div
          style={{
            borderColor: summaryTone.border,
            background: summaryTone.bg,
          }}
          className="rounded-[10px] border p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div
                style={{
                  borderColor: summaryTone.border,
                  color: summaryTone.accent,
                }}
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-[var(--sq-surface-raised)]"
              >
                <Award className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p
                  style={{ color: summaryTone.accent }}
                  className="text-[11px] font-semibold uppercase tracking-wider"
                >
                  Resumo para Decisão
                </p>
                <h3 className="font-display text-lg font-bold text-[var(--sq-content-primary)]">
                  1º lugar: {topCandidate.name}{' '}
                  <span className="font-sans text-sm font-semibold text-[var(--sq-content-secondary)]">
                    ({formatScore100(topScore)}/100 pontos · {formatPercent(topFirstPlaceProb, 0)} de
                    chance de liderança)
                  </span>
                </h3>
                <p className="text-xs leading-relaxed text-[var(--sq-content-primary)]">
                  A banca apresentou <strong>{agreementBadge.label.toLowerCase()}</strong> (
                  {formatPercent(consensus.gcr, 0)} acima da meta de{' '}
                  {formatPercent(consensus.configuration.threshold, 0)}).
                  {candidatesWithHighGaps.length > 0
                    ? ` Atenção: ${candidatesWithHighGaps.join(', ')} possuem lacunas relevantes de informação no currículo — veja abaixo os critérios recomendados para a entrevista.`
                    : ' Os currículos forneceram boas evidências para comparação entre os perfis.'}
                </p>
              </div>
            </div>

            <div className="no-print flex flex-wrap items-center gap-2">
              <PillButton variant="default" onClick={onOpenBeliefModal}>
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>Ajustar notas da banca</span>
              </PillButton>
              <PillButton variant="default" onClick={handleExportCsv}>
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>Exportar CSV</span>
              </PillButton>
              <PillButton variant="primary" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5" />
                <span>Imprimir / PDF</span>
              </PillButton>
            </div>
          </div>
        </div>
      ) : null}

      {/* KPI Strip — 3 scannable HR metrics */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="min-w-0 rounded-[10px] border border-[var(--sq-rule)] bg-[var(--sq-surface-primary)] p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[var(--sq-content-secondary)]">
              Acordo da Banca
            </p>
            <span
              style={{
                background: agreementBadge.bg,
                borderColor: agreementBadge.border,
                color: agreementBadge.color,
              }}
              className="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
            >
              {agreementBadge.label}
            </span>
          </div>
          <p className="mt-1.5 font-display text-2xl font-bold tabular-nums text-[var(--sq-content-primary)]">
            {formatPercent(consensus.gcr, 0)}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-[var(--sq-content-secondary)]">
            {zeroAccepted
              ? `A banca não atingiu a meta de ${formatPercent(consensus.configuration.threshold, 0)}. Vale alinhar percepções em calibração.`
              : `Chance de a banca concordar acima da meta de ${formatPercent(consensus.configuration.threshold, 0)}.`}
          </p>
        </div>

        <div className="min-w-0 rounded-[10px] border border-[var(--sq-rule)] bg-[var(--sq-surface-primary)] p-4">
          <p className="text-xs font-semibold text-[var(--sq-content-secondary)]">
            Alinhamento Médio
          </p>
          <p className="mt-1.5 font-display text-2xl font-bold tabular-nums text-[var(--sq-content-primary)]">
            {formatPercent(consensus.unconditional_mean_ci, 0)}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-[var(--sq-content-secondary)]">
            Média geral de concordância entre todos os avaliadores da banca.
          </p>
        </div>

        <div className="min-w-0 rounded-[10px] border border-[var(--sq-rule)] bg-[var(--sq-surface-primary)] p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[var(--sq-content-secondary)]">
              Evidências nos Currículos
            </p>
            {sourceMode === 'subq-snap-1.2' ? (
              <ShieldCheck className="h-4 w-4 text-[var(--accent-green)]" aria-hidden="true" />
            ) : (
              <FlaskConical className="h-4 w-4 text-[var(--accent-orange)]" aria-hidden="true" />
            )}
          </div>
          <p className="mt-1.5 font-display text-2xl font-bold tabular-nums text-[var(--sq-content-primary)]">
            {formatPercent(overallCompleteness, 0)}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-[var(--sq-content-secondary)]">
            {overallCompleteness < 0.65
              ? 'Muitas informações ausentes — valide os critérios prioritários na entrevista.'
              : 'Percentual de critérios com informações concretas nos currículos.'}
          </p>
        </div>
      </div>

      {/* Priority Interview Guide */}
      {interviewTopics.length > 0 ? (
        <SurfaceCard className="min-w-0 p-4 sm:p-5">
          <div className="mb-3 flex items-start gap-2.5">
            <MessageSquareWarning
              className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-orange)]"
              aria-hidden="true"
            />
            <div>
              <h3 className="font-display text-base font-bold text-[var(--sq-content-primary)]">
                Pontos Prioritários para a Entrevista
              </h3>
              <p className="text-xs text-[var(--sq-content-secondary)]">
                Critérios em que faltaram informações no currículo ou em que a banca divergiu mais —
                bons tópicos para investigar na próxima conversa.
              </p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {interviewTopics.map((item) => (
              <div
                key={`${item.candidateName}-${item.criterionLabel}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[var(--sq-rule)] bg-[var(--sq-surface-primary)] px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--sq-content-primary)]">
                    {item.candidateName}
                  </p>
                  <p className="text-[11px] text-[var(--sq-content-secondary)]">
                    {item.criterionLabel}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium">
                  {item.reason === 'gap' || item.reason === 'both' ? (
                    <span className="rounded-full border border-[var(--accent-orange)] bg-[var(--accent-orange-soft)] px-2 py-0.5 text-[var(--sq-content-primary)]">
                      Sem evidência: {formatPercent(item.meanGap, 0)}
                    </span>
                  ) : null}
                  {item.reason === 'divergence' || item.reason === 'both' ? (
                    <span className="rounded-full border border-[var(--accent-red)] bg-[var(--accent-red-soft)] px-2 py-0.5 text-[var(--sq-content-primary)]">
                      Divergência: {formatPercent(item.meanDivergence, 0)}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>
      ) : null}

      {/* Candidate Ranking Table */}
      <SurfaceCard focusTone="green" className="min-w-0 p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3
              id="ranking-table-title"
              className="font-display text-base font-bold text-[var(--sq-content-primary)]"
            >
              Ranking de Candidatos
            </h3>
            <p className="text-xs text-[var(--sq-content-secondary)]">
              Pontuação de 0 a 100 considerando todos os critérios, a faixa provável de variação e
              eventuais lacunas nos currículos.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <ArrowUpDown className="h-3.5 w-3.5 text-[var(--sq-content-secondary)]" />
            <PillButton active={sortBy === 'equal'} onClick={() => setSortBy('equal')}>
              Peso igual por avaliador
            </PillButton>
            <PillButton
              active={sortBy === 'rankWeighted'}
              onClick={() => setSortBy('rankWeighted')}
              title="Dá mais peso a avaliadores que mantiveram uma ordem clara entre os candidatos, com menos incerteza."
            >
              Priorizar avaliadores mais firmes
            </PillButton>
          </div>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-labelledby="ranking-table-title"
          className="table-wrapper"
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Candidato</th>
                <th scope="col">Pontuação (0–100)</th>
                <th scope="col">Faixa Provável</th>
                <th scope="col">Chance de 1º Lugar</th>
                <th scope="col">Lacunas no Currículo</th>
                <th scope="col">Risco de Empate</th>
              </tr>
            </thead>
            <tbody>
              {sortedCandidates.map((candRes) => {
                const cand = candidates[candRes.index];
                const rankPos = displayRanks.get(candRes.index) ?? candRes.index + 1;
                const score =
                  sortBy === 'equal' ? candRes.meanUtilityEqual : candRes.meanUtilityRankWeighted;
                const p05 =
                  sortBy === 'equal' ? candRes.utilityP05 : candRes.utilityP05RankWeighted;
                const p95 =
                  sortBy === 'equal' ? candRes.utilityP95 : candRes.utilityP95RankWeighted;
                const top1Prob =
                  sortBy === 'equal'
                    ? (candRes.rankProbabilitiesEqual[0] ?? 0)
                    : (candRes.rankProbabilitiesRankWeighted[0] ?? 0);
                const tieRate =
                  sortBy === 'equal' ? candRes.tieRate : candRes.tieRateRankWeighted;
                const gapBadge = getGapBadge(candRes.meanIgnorance);
                const scorePct = Math.min(100, Math.max(0, score * 100));

                return (
                  <tr key={cand?.id ?? candRes.index}>
                    <th scope="row">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-1.5 font-mono text-[11px] font-bold tabular-nums ${
                            rankPos === 1
                              ? 'border-[var(--accent-green)] bg-[var(--accent-green-soft)] text-[var(--accent-green)]'
                              : 'border-[var(--sq-rule-strong)] bg-[var(--sq-surface-secondary)] text-[var(--sq-content-primary)]'
                          }`}
                        >
                          {rankPos}º
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[var(--sq-content-primary)]">
                            {cand?.name ?? `Candidato ${candRes.index + 1}`}
                          </p>
                          {cand?.summary ? (
                            <p className="max-w-[240px] truncate text-[11px] font-normal text-[var(--sq-content-secondary)]">
                              {cand.summary}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </th>

                    <td data-label="Pontuação (0–100)" className="min-w-[140px]">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-display text-base font-bold tabular-nums text-[var(--sq-content-primary)]">
                          {formatScore100(score)}
                        </span>
                        <span className="text-[11px] text-[var(--sq-content-secondary)]">/ 100</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full max-w-[140px] overflow-hidden rounded-full bg-[var(--sq-surface-secondary)]">
                        <div
                          className="h-full rounded-full transition-[width] duration-300"
                          style={{
                            width: `${scorePct}%`,
                            backgroundColor:
                              rankPos === 1 ? 'var(--accent-green)' : 'var(--accent-blue)',
                          }}
                        />
                      </div>
                    </td>

                    <td data-label="Faixa Provável" className="text-xs tabular-nums">
                      <span className="font-medium text-[var(--sq-content-primary)]">
                        {formatScore100(p05)} a {formatScore100(p95)} pts
                      </span>
                      <span className="block text-[11px] text-[var(--sq-content-secondary)]">
                        Variação estimada
                      </span>
                    </td>

                    <td data-label="Chance de 1º Lugar" className="text-xs tabular-nums">
                      <span className="font-semibold text-[var(--sq-content-primary)]">
                        {formatPercent(top1Prob, 0)}
                      </span>
                    </td>

                    <td data-label="Lacunas no Currículo" className="text-xs tabular-nums">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-[var(--sq-content-primary)]">
                          {formatPercent(candRes.meanIgnorance, 0)}
                        </span>
                        <span
                          style={{ background: gapBadge.bg, borderColor: gapBadge.border }}
                          className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-[var(--sq-content-primary)]"
                        >
                          {gapBadge.label}
                        </span>
                      </div>
                    </td>

                    <td data-label="Risco de Empate" className="text-xs tabular-nums">
                      <span className="text-[var(--sq-content-primary)]">
                        {formatPercent(tieRate, 0)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SurfaceCard>

      {/* Evaluator Consistency & Pairwise Alignment Heatmap */}
      <div className="grid gap-4 lg:grid-cols-12">
        <SurfaceCard className="min-w-0 p-4 sm:p-5 lg:col-span-5">
          <h3 className="font-display text-base font-bold text-[var(--sq-content-primary)]">
            Consistência dos Avaliadores
          </h3>
          <p className="mt-1 text-xs text-[var(--sq-content-secondary)]">
            Mostra o quanto cada avaliador manteve uma ordem clara de preferência e quantas
            informações faltaram para sua análise.
          </p>

          <div className="mt-3 space-y-3">
            {evaluators.map((ev, k) => {
              const equalW = evaluation.evaluatorEqualWeights[k] ?? 1 / evaluators.length;
              const stabilityW = evaluation.evaluatorWeightsRankStability[k] ?? equalW;
              const maxRankProb = evaluation.evaluatorMaxRankProbabilities[k] ?? 0;
              const meanQ = evaluatorMeanIgnorance[k] ?? 0;

              return (
                <div
                  key={ev.id}
                  className="rounded-[8px] border border-[var(--sq-rule)] bg-[var(--sq-surface-primary)] p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-[var(--sq-content-primary)]">
                        {ev.name}
                      </p>
                      <p className="text-[11px] text-[var(--sq-content-secondary)]">{ev.role}</p>
                    </div>
                    <span className="rounded-full border border-[var(--sq-rule)] bg-[var(--sq-surface-secondary)] px-2 py-0.5 text-[10px] font-medium text-[var(--sq-content-secondary)]">
                      Sem evidência: {formatPercent(meanQ, 0)}
                    </span>
                  </div>

                  <div className="mt-2.5 grid grid-cols-3 gap-2 text-xs tabular-nums">
                    <div>
                      <span className="block text-[10px] text-[var(--sq-content-secondary)]">
                        Firmeza do ranking
                      </span>
                      <span className="font-semibold text-[var(--sq-content-primary)]">
                        {formatPercent(maxRankProb, 0)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-[var(--sq-content-secondary)]">
                        Peso igual
                      </span>
                      <span className="font-medium text-[var(--sq-content-primary)]">
                        {formatPercent(equalW, 0)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-[var(--sq-content-secondary)]">
                        Peso por firmeza
                      </span>
                      <span className="font-semibold text-[var(--accent-blue)]">
                        {formatPercent(stabilityW, 0)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </SurfaceCard>

        <SurfaceCard className="min-w-0 p-4 sm:p-5 lg:col-span-7">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-display text-base font-bold text-[var(--sq-content-primary)]">
                Onde a Banca Concorda ou Diverge
              </h3>
              <p className="mt-1 text-xs text-[var(--sq-content-secondary)]">
                Divergências altas mostram exatamente em qual candidato e critério vale alinhar as
                percepções na reunião de calibração.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium">
              <span
                className="rounded border px-1.5 py-0.5"
                style={{
                  background: 'var(--accent-green-soft)',
                  borderColor: 'var(--accent-green)',
                }}
              >
                Alinhados
              </span>
              <span
                className="rounded border px-1.5 py-0.5"
                style={{
                  background: 'var(--accent-gold-soft)',
                  borderColor: 'var(--accent-gold)',
                }}
              >
                Moderada
              </span>
              <span
                className="rounded border px-1.5 py-0.5"
                style={{
                  background: 'var(--accent-red-soft)',
                  borderColor: 'var(--accent-red)',
                }}
              >
                Alta divergência
              </span>
            </div>
          </div>

          <div className="mt-3 space-y-3">
            {pairDisagreementSummaries.map((pair) => {
              const [k, l] = pair.evaluators;
              const nameK = evaluators[k]?.name ?? `Avaliador ${k + 1}`;
              const nameL = evaluators[l]?.name ?? `Avaliador ${l + 1}`;
              const pairTone = getHeatmapColors(pair.overallMean);

              return (
                <div
                  key={`pair-${k}-${l}`}
                  className="min-w-0 rounded-[8px] border border-[var(--sq-rule)] bg-[var(--sq-surface-primary)] p-3"
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--sq-content-primary)]">
                      {nameK} × {nameL}
                    </span>
                    <span
                      style={{ background: pairTone.bg, borderColor: pairTone.border }}
                      className="rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums text-[var(--sq-content-primary)]"
                    >
                      Divergência média: {formatPercent(pair.overallMean, 0)} ({pairTone.label})
                    </span>
                  </div>

                  <div
                    tabIndex={0}
                    role="region"
                    aria-label={`Comparação entre ${nameK} e ${nameL}`}
                    className="overflow-x-auto rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-blue)]"
                  >
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr>
                          <th
                            scope="col"
                            className="py-1 pr-2 text-left text-[10px] font-semibold uppercase text-[var(--sq-content-secondary)]"
                          >
                            Candidato
                          </th>
                          {criteria.map((crit) => (
                            <th
                              key={`${k}-${l}-${crit.id}`}
                              scope="col"
                              className="px-1.5 py-1 text-center text-[10px] font-semibold text-[var(--sq-content-secondary)]"
                              title={crit.label}
                            >
                              <span className="inline-block max-w-[110px] truncate">
                                {crit.label}
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pair.distances.map((row, i) => (
                          <tr key={`${k}-${l}-cand-${i}`}>
                            <th
                              scope="row"
                              className="whitespace-nowrap py-1 pr-2 text-left font-medium text-[var(--sq-content-primary)]"
                            >
                              {candidates[i]?.name ?? `Candidato ${i + 1}`}
                            </th>
                            {row.map((d, j) => {
                              const tone = getHeatmapColors(d);
                              return (
                                <td key={`${k}-${l}-${i}-${j}`} className="p-1 text-center">
                                  <span
                                    title={`${candidates[i]?.name ?? i} · ${criteria[j]?.label ?? j}: ${formatPercent(d, 0)} (${tone.label})`}
                                    style={{
                                      background: tone.bg,
                                      borderColor: tone.border,
                                    }}
                                    className="inline-block min-w-[48px] rounded border px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-[var(--sq-content-primary)]"
                                  >
                                    {formatPercent(d, 0)}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </SurfaceCard>
      </div>

      {/* Collapsible Technical & Audit Details */}
      <details className="no-print group rounded-[10px] border border-[var(--sq-rule)] bg-[var(--sq-surface-secondary)]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-xs font-semibold text-[var(--sq-content-primary)] select-none">
          <span>Ver detalhes técnicos, sensibilidade e exportação de auditoria (JSON)</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--sq-content-secondary)] transition-transform group-open:rotate-180" />
        </summary>

        <div className="space-y-4 border-t border-[var(--sq-rule)] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[var(--sq-rule)] bg-[var(--sq-surface-primary)] px-3.5 py-2.5 text-xs">
            <span className="text-[var(--sq-content-secondary)]">
              Força do consenso (quando acima da meta):{' '}
              <strong className="text-[var(--sq-content-primary)]">
                {zeroAccepted ? 'Abaixo da meta' : formatPercent(consensus.conditional_mean_ci!, 1)}
              </strong>{' '}
              · {consensus.accepted_count.toLocaleString('pt-BR')} de{' '}
              {consensus.evaluations.toLocaleString('pt-BR')} cenários aceitos
            </span>
            <PillButton variant="default" onClick={handleExportAuditJson}>
              <Download className="h-3.5 w-3.5" />
              <span>Exportar dados técnicos (JSON)</span>
            </PillButton>
          </div>
          {consensus.warnings.length > 0 ? (
            <div className="space-y-2">
              {consensus.warnings.map((warning, idx) => (
                <AlertBanner key={`warn-${idx}`} tone="warning" title="Observação estatística">
                  {warning}
                </AlertBanner>
              ))}
            </div>
          ) : null}

          <AlertBanner tone="info" title="Como funciona o cálculo (transparência metodológica)">
            <ul className="list-disc space-y-1 pl-4">
              <li>
                <strong>Falta de informação não é nota baixa:</strong> quando um currículo não
                menciona um requisito, o sistema mantém essa parcela em aberto e testa múltiplos
                cenários possíveis para mostrar a faixa realista de pontuação do candidato.
              </li>
              <li>
                <strong>Peso por firmeza do ranking:</strong> indica apenas o quanto a ordem de
                preferência de cada avaliador se manteve estável — não mede senioridade ou
                autoridade do avaliador.
              </li>
              <li>
                <strong>Referência técnica:</strong> motor auditável baseado em consenso
                probabilístico (Dai et al., 2025) com{' '}
                {consensus.evaluations.toLocaleString('pt-BR')} simulações (semente{' '}
                {consensus.configuration.seed}).
              </li>
            </ul>
          </AlertBanner>

          {/* Sensitivity Grid */}
          <div className="space-y-2">
            <div>
              <h4
                id="sensitivity-table-title"
                className="text-sm font-semibold text-[var(--sq-content-primary)]"
              >
                Simulação de Sensibilidade (como o acordo muda conforme o nível de exigência)
              </h4>
              <p className="text-xs text-[var(--sq-content-secondary)]">
                Mostra a taxa de acordo da banca para diferentes metas de exigência (colunas) e
                critérios de comparação (linhas). A célula destacada em azul é a configuração atual.
              </p>
            </div>

            <div
              tabIndex={0}
              role="region"
              aria-labelledby="sensitivity-table-title"
              className="table-wrapper"
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">Equilíbrio (α)</th>
                    {evaluation.sensitivityGrid.thresholds.map((t) => (
                      <th key={`th-g-${t}`} scope="col">
                        Meta {formatPercent(t, 0)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {evaluation.sensitivityGrid.alphas.map((a, aIdx) => (
                    <tr key={`row-a-${a}`}>
                      <th scope="row" className="font-mono text-xs">
                        <div className="flex items-center gap-1.5">
                          <span>α = {formatDecimal(a, 2)}</span>
                          {a === 0 ? (
                            <span
                              title="Em α = 0 considera apenas dispersão (menos sensível a divergência direta)"
                              className="inline-flex items-center text-[var(--accent-orange)]"
                            >
                              <AlertTriangle className="h-3.5 w-3.5" />
                            </span>
                          ) : null}
                        </div>
                      </th>
                      {evaluation.sensitivityGrid.cells[aIdx]?.map((cell) => {
                        const isActive =
                          Math.abs(cell.alpha - consensus.configuration.alpha) < 1e-6 &&
                          Math.abs(cell.threshold - consensus.configuration.threshold) < 1e-6;
                        return (
                          <td
                            key={`cell-${cell.alpha}-${cell.threshold}`}
                            data-label={`Meta ${formatPercent(cell.threshold, 0)}`}
                            className="font-mono text-xs tabular-nums"
                            style={
                              isActive
                                ? {
                                    background: 'var(--accent-blue-soft)',
                                    boxShadow: 'inset 0 0 0 1.5px var(--accent-blue)',
                                  }
                                : undefined
                            }
                          >
                            <div className="font-semibold text-[var(--sq-content-primary)]">
                              Acordo {formatPercent(cell.gcr, 0)}
                            </div>
                            <div className="text-[11px] text-[var(--sq-content-secondary)]">
                              {cell.conditionalMeanCi !== null
                                ? `Força ${formatPercent(cell.conditionalMeanCi, 0)}`
                                : 'Abaixo da meta'}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

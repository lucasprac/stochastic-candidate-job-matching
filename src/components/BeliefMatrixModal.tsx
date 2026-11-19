import { useEffect, useId, useMemo, useState } from 'react';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { fsum } from '../stochastic/consensus';
import { formatPercent } from '../lib/format';
import { AlertBanner, DialogShell, PillButton } from './ui';

export interface BeliefMatrixModalProps {
  open: boolean;
  onClose: () => void;
  evaluators: Array<{ id: string; name: string }>;
  candidates: Array<{ id: string; name: string }>;
  criteria: Array<{ id: string; label: string }>;
  grades: string[];
  originalMatrices: number[][][][];
  workingMatrices: number[][][][];
  onApplyMatrices: (nextMatrices: number[][][][]) => void;
  onRestoreOriginals: () => void;
}

const GRADE_COLORS = [
  'var(--accent-red)',
  'var(--accent-orange)',
  'var(--accent-blue)',
  'var(--accent-green)',
  'var(--accent-gold)',
  'var(--sq-content-primary)',
];

const EDIT_EPS = 1e-6;

function cloneTensor(tensor: number[][][][]): number[][][][] {
  return tensor.map((evalMat) =>
    evalMat.map((candRow) => candRow.map((cell) => [...cell])),
  );
}

function roundMass(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function isCellEdited(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return true;
  for (let n = 0; n < a.length; n += 1) {
    if (Math.abs((a[n] ?? 0) - (b[n] ?? 0)) > EDIT_EPS) {
      return true;
    }
  }
  return false;
}

export function BeliefMatrixModal({
  open,
  onClose,
  evaluators,
  candidates,
  criteria,
  grades,
  originalMatrices,
  workingMatrices,
  onApplyMatrices,
  onRestoreOriginals,
}: BeliefMatrixModalProps) {
  const titleId = useId();
  const [draft, setDraft] = useState<number[][][][]>(() => cloneTensor(workingMatrices));
  const [selectedK, setSelectedK] = useState(0);
  const [selectedI, setSelectedI] = useState(0);

  useEffect(() => {
    if (open) {
      setDraft(cloneTensor(workingMatrices));
      setSelectedK((prev) => (prev < evaluators.length ? prev : 0));
      setSelectedI((prev) => (prev < candidates.length ? prev : 0));
    }
  }, [open, workingMatrices, evaluators.length, candidates.length]);

  const editSummary = useMemo(() => {
    let totalEditedCells = 0;
    const editedByEval = new Array<number>(evaluators.length).fill(0);
    const editedByCand = new Array<number>(candidates.length).fill(0);

    for (let k = 0; k < evaluators.length; k += 1) {
      for (let i = 0; i < candidates.length; i += 1) {
        for (let j = 0; j < criteria.length; j += 1) {
          const dCell = draft[k]?.[i]?.[j];
          const oCell = originalMatrices[k]?.[i]?.[j];
          if (dCell && oCell && isCellEdited(dCell, oCell)) {
            totalEditedCells += 1;
            editedByEval[k] += 1;
            editedByCand[i] += 1;
          }
        }
      }
    }

    return { totalEditedCells, editedByEval, editedByCand };
  }, [draft, originalMatrices, evaluators.length, candidates.length, criteria.length]);

  const workingHasEdits = useMemo(() => {
    for (let k = 0; k < evaluators.length; k += 1) {
      for (let i = 0; i < candidates.length; i += 1) {
        for (let j = 0; j < criteria.length; j += 1) {
          const wCell = workingMatrices[k]?.[i]?.[j];
          const oCell = originalMatrices[k]?.[i]?.[j];
          if (wCell && oCell && isCellEdited(wCell, oCell)) {
            return true;
          }
        }
      }
    }
    return false;
  }, [workingMatrices, originalMatrices, evaluators.length, candidates.length, criteria.length]);

  const hasUnappliedChanges = useMemo(() => {
    for (let k = 0; k < evaluators.length; k += 1) {
      for (let i = 0; i < candidates.length; i += 1) {
        for (let j = 0; j < criteria.length; j += 1) {
          const dCell = draft[k]?.[i]?.[j];
          const wCell = workingMatrices[k]?.[i]?.[j];
          if (dCell && wCell && isCellEdited(dCell, wCell)) {
            return true;
          }
        }
      }
    }
    return false;
  }, [draft, workingMatrices, evaluators.length, candidates.length, criteria.length]);

  const handleGradePercentChange = (
    k: number,
    i: number,
    j: number,
    n: number,
    rawPercent: number,
  ) => {
    const rawValue = Number.isFinite(rawPercent) ? rawPercent / 100 : 0;
    setDraft((prev) => {
      const next = cloneTensor(prev);
      const cell = next[k]?.[i]?.[j];
      if (!cell) return prev;

      let otherSum = 0;
      for (let idx = 0; idx < cell.length; idx += 1) {
        if (idx !== n) {
          otherSum += cell[idx];
        }
      }
      const maxAllowed = Math.max(0, Math.floor(Math.max(0, 1 - otherSum) * 10000) / 10000);
      let clamped = Math.min(maxAllowed, Math.max(0, roundMass(rawValue)));
      cell[n] = clamped;

      const total = fsum(cell);
      if (total > 1) {
        clamped = Math.max(0, clamped - (total - 1));
        cell[n] = clamped;
      }

      return next;
    });
  };

  const handleRestoreCell = (k: number, i: number, j: number) => {
    const origCell = originalMatrices[k]?.[i]?.[j];
    if (!origCell) return;
    setDraft((prev) => {
      const next = cloneTensor(prev);
      if (next[k]?.[i]?.[j]) {
        next[k][i][j] = [...origCell];
      }
      return next;
    });
  };

  const handleRestoreAll = () => {
    setDraft(cloneTensor(originalMatrices));
  };

  const handleSetQuickGrade = (k: number, i: number, j: number, targetGradeIdx: number | null) => {
    setDraft((prev) => {
      const next = cloneTensor(prev);
      const cell = next[k]?.[i]?.[j];
      if (!cell) return prev;
      for (let n = 0; n < cell.length; n += 1) {
        cell[n] = targetGradeIdx === n ? 1 : 0;
      }
      return next;
    });
  };

  const handleApply = () => {
    if (editSummary.totalEditedCells === 0 && workingHasEdits) {
      onRestoreOriginals();
    } else {
      onApplyMatrices(cloneTensor(draft));
    }
    onClose();
  };

  const safeK = Math.min(selectedK, Math.max(0, evaluators.length - 1));
  const safeI = Math.min(selectedI, Math.max(0, candidates.length - 1));

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      titleId={titleId}
      title="Revisar e Ajustar Notas da Banca"
      subtitle="Ajuste manualmente a distribuição das notas caso você tenha informações adicionais da entrevista. Os valores originais ficam salvos."
      maxWidthClass="max-w-4xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <PillButton
              variant="default"
              onClick={handleRestoreAll}
              disabled={editSummary.totalEditedCells === 0 && !workingHasEdits}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Restaurar notas originais</span>
            </PillButton>
            {editSummary.totalEditedCells > 0 ? (
              <span className="text-xs font-medium text-[var(--accent-orange)]">
                {editSummary.totalEditedCells}{' '}
                {editSummary.totalEditedCells === 1 ? 'critério ajustado' : 'critérios ajustados'}
              </span>
            ) : (
              <span className="text-xs text-[var(--sq-content-secondary)]">
                Nenhuma alteração manual feita
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PillButton variant="ghost" onClick={onClose}>
              Cancelar
            </PillButton>
            <PillButton
              variant="primary"
              onClick={handleApply}
              disabled={!hasUnappliedChanges}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Aplicar ajustes e atualizar ranking</span>
            </PillButton>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <AlertBanner tone="info" title="Como ler e ajustar cada critério">
          Cada critério distribui até <strong>100%</strong> entre os níveis da escala. A parte que
          ficar sem preencher (listrada na barra) representa <strong>falta de evidência</strong> no
          currículo — e não uma nota baixa. Qualquer ajuste fica marcado como{' '}
          <strong>Ajustado manualmente</strong> sem perder a avaliação original.
        </AlertBanner>

        {/* Evaluator and Candidate selectors */}
        <div className="grid gap-3 rounded-[10px] border border-[var(--sq-rule)] bg-[var(--sq-surface-secondary)] p-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sq-content-secondary)]">
              Avaliador
            </p>
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Selecionar avaliador">
              {evaluators.map((ev, k) => {
                const count = editSummary.editedByEval[k] ?? 0;
                return (
                  <PillButton
                    key={ev.id}
                    role="tab"
                    aria-selected={safeK === k}
                    active={safeK === k}
                    onClick={() => setSelectedK(k)}
                  >
                    <span>{ev.name}</span>
                    {count > 0 ? (
                      <span className="ml-1 rounded-full border border-[var(--accent-orange)] bg-[var(--accent-orange-soft)] px-1.5 py-0.2 font-mono text-[10px] font-semibold text-[var(--sq-content-primary)]">
                        {count}
                      </span>
                    ) : null}
                  </PillButton>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sq-content-secondary)]">
              Candidato
            </p>
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Selecionar candidato">
              {candidates.map((cand, i) => {
                const count = editSummary.editedByCand[i] ?? 0;
                return (
                  <PillButton
                    key={cand.id}
                    role="tab"
                    aria-selected={safeI === i}
                    active={safeI === i}
                    onClick={() => setSelectedI(i)}
                  >
                    <span>{cand.name}</span>
                    {count > 0 ? (
                      <span className="ml-1 rounded-full border border-[var(--accent-orange)] bg-[var(--accent-orange-soft)] px-1.5 py-0.2 font-mono text-[10px] font-semibold text-[var(--sq-content-primary)]">
                        {count}
                      </span>
                    ) : null}
                  </PillButton>
                );
              })}
            </div>
          </div>
        </div>

        {/* Criteria cards for selected evaluator x candidate */}
        <div className="space-y-3">
          {criteria.map((crit, j) => {
            const cell = draft[safeK]?.[safeI]?.[j] ?? [];
            const origCell = originalMatrices[safeK]?.[safeI]?.[j] ?? [];
            const assignedSum = Math.min(1, Math.max(0, fsum(cell)));
            const ignoranceQ = Math.max(0, 1 - assignedSum);
            const origSum = Math.min(1, Math.max(0, fsum(origCell)));
            const origQ = Math.max(0, 1 - origSum);
            const edited = isCellEdited(cell, origCell);

            return (
              <div
                key={crit.id}
                className={`rounded-[10px] border p-3.5 transition ${
                  edited
                    ? 'border-[var(--accent-orange)] bg-[var(--accent-orange-soft)]/30'
                    : 'border-[var(--sq-rule)] bg-[var(--sq-surface-primary)]'
                }`}
              >
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-[var(--sq-content-primary)]">
                      {crit.label}
                    </h3>
                    {edited ? (
                      <span className="rounded-full border border-[var(--accent-orange)] bg-[var(--accent-orange-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-orange)]">
                        Ajustado manualmente
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums">
                    <span className="text-[var(--sq-content-primary)]">
                      Avaliado: <strong>{formatPercent(assignedSum, 0)}</strong>
                    </span>
                    <span
                      className={
                        ignoranceQ > 0.35
                          ? 'font-semibold text-[var(--accent-orange)]'
                          : 'text-[var(--sq-content-secondary)]'
                      }
                    >
                      Sem evidência: <strong>{formatPercent(ignoranceQ, 0)}</strong>
                    </span>
                    {edited ? (
                      <button
                        type="button"
                        onClick={() => handleRestoreCell(safeK, safeI, j)}
                        className="inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-[var(--accent-blue)] hover:bg-[var(--accent-blue-soft)]"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>Restaurar critério</span>
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Stacked distribution + missing evidence bar */}
                <div
                  className="mb-3 flex h-2.5 w-full overflow-hidden rounded-full border border-[var(--sq-rule)] bg-[var(--sq-surface-secondary)]"
                  aria-label={`Distribuição de avaliação para ${crit.label}`}
                >
                  {cell.map((mass, n) => {
                    const pct = Math.max(0, Math.min(100, mass * 100));
                    if (pct <= 0) return null;
                    return (
                      <div
                        key={grades[n] ?? n}
                        title={`${grades[n] ?? `Nível ${n + 1}`}: ${formatPercent(mass, 1)}`}
                        style={{
                          width: `${pct}%`,
                          backgroundColor: GRADE_COLORS[n % GRADE_COLORS.length],
                        }}
                      />
                    );
                  })}
                  {ignoranceQ > 0 ? (
                    <div
                      title={`Sem evidência no currículo: ${formatPercent(ignoranceQ, 1)}`}
                      style={{
                        width: `${Math.max(0, Math.min(100, ignoranceQ * 100))}%`,
                        backgroundImage:
                          'repeating-linear-gradient(45deg, transparent, transparent 4px, var(--sq-rule-strong) 4px, var(--sq-rule-strong) 8px)',
                      }}
                    />
                  ) : null}
                </div>

                {/* Quick actions + remaining budget */}
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[var(--sq-content-secondary)]">Atalho rápido:</span>
                    {grades.map((gradeLabel, n) => (
                      <button
                        key={`quick-${crit.id}-${n}`}
                        type="button"
                        onClick={() => handleSetQuickGrade(safeK, safeI, j, n)}
                        className="cursor-pointer rounded-full border border-[var(--sq-rule-strong)] bg-[var(--sq-surface-secondary)] px-2 py-0.5 text-[10px] font-medium text-[var(--sq-content-primary)] transition hover:border-[var(--sq-content-primary)]"
                      >
                        100% {gradeLabel}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => handleSetQuickGrade(safeK, safeI, j, null)}
                      className="cursor-pointer rounded-full border border-[var(--sq-rule-strong)] bg-[var(--sq-surface-secondary)] px-2 py-0.5 text-[10px] font-medium text-[var(--sq-content-secondary)] transition hover:border-[var(--sq-content-primary)] hover:text-[var(--sq-content-primary)]"
                    >
                      Sem evidência
                    </button>
                  </div>
                  <span className="text-[11px] tabular-nums text-[var(--sq-content-secondary)]">
                    Saldo livre para distribuir: <strong>{formatPercent(ignoranceQ, 0)}</strong>
                  </span>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  {grades.map((gradeLabel, n) => {
                    const val = cell[n] ?? 0;
                    const pctVal = Math.round(val * 100);
                    const origVal = origCell[n] ?? 0;
                    const gradeChanged = Math.abs(val - origVal) > EDIT_EPS;
                    const otherSum = cell.reduce((acc, v, idx) => (idx === n ? acc : acc + v), 0);
                    const maxPctForGrade = Math.max(0, Math.floor((1 - otherSum) * 100 + 1e-6));
                    const inputId = `${titleId}-cell-${safeK}-${safeI}-${j}-${n}`;

                    return (
                      <div
                        key={`${crit.id}-g-${n}`}
                        className="rounded-[8px] border border-[var(--sq-rule)] bg-[var(--sq-surface-raised)] p-2.5"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <label
                            htmlFor={inputId}
                            className="truncate text-xs font-medium text-[var(--sq-content-primary)]"
                          >
                            {gradeLabel}
                          </label>
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: GRADE_COLORS[n % GRADE_COLORS.length] }}
                            aria-hidden="true"
                          />
                        </div>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <input
                            id={inputId}
                            type="number"
                            min={0}
                            max={maxPctForGrade}
                            step={1}
                            value={pctVal}
                            onChange={(e) =>
                              handleGradePercentChange(safeK, safeI, j, n, Number(e.target.value))
                            }
                            className="sq-input sq-input--green px-2 py-1 font-mono text-xs tabular-nums"
                          />
                          <span className="text-xs font-medium text-[var(--sq-content-secondary)]">
                            %
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={pctVal}
                          aria-label={`${gradeLabel} (${crit.label})`}
                          onChange={(e) =>
                            handleGradePercentChange(safeK, safeI, j, n, Number(e.target.value))
                          }
                          className="mt-2 w-full"
                        />
                        <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--sq-content-secondary)]">
                          <span>{formatPercent(val, 0)}</span>
                          {gradeChanged ? (
                            <span className="font-medium text-[var(--accent-orange)]">
                              Original: {formatPercent(origVal, 0)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {edited ? (
                  <p className="mt-2 text-[11px] text-[var(--sq-content-secondary)]">
                    Avaliação original preservada: sem evidência original de {formatPercent(origQ, 0)}.
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </DialogShell>
  );
}

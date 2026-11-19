import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Eraser,
  FileText,
  KeyRound,
  Loader2,
  Play,
  Plus,
  Square,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  DecideResponse,
  SubqAnswer,
  SubqChoiceAnswer,
  SubqNoulAnswer,
  SubqQuestionType,
  SubqScoreAnswer,
} from '../types/subq';
import {
  QUICK_PRESETS,
  buildQuickQuestionsPayload,
  type QuickQuestionDraft,
} from '../data/presets';
import { SubqApiError, decideWithSubq, normaliseProbabilities } from '../lib/snap';
import { formatDecimal, formatPercent, slugifyKey } from '../lib/format';
import { AlertBanner, PillButton, ProbabilityBar, StepBadge, SurfaceCard } from './ui';

const ALLOWED_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.json']);
const UNSUPPORTED_DOC_EXTENSIONS = new Set(['.pdf', '.doc', '.docx']);
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_STATE_CHARS = 200_000;

interface RunSnapshot {
  signature: string;
  response: DecideResponse;
  answersByDraftId: Record<string, SubqAnswer>;
  choiceLabelsByDraftId: Record<string, Record<string, string>>;
}

function buildChoiceLabelMap(draft: QuickQuestionDraft): Record<string, string> {
  const map: Record<string, string> = {};
  const usedOptionKeys = new Set<string>();
  draft.choiceOptions.forEach((opt, optIdx) => {
    const label = opt.key.trim() || opt.description.trim() || `Opção ${optIdx + 1}`;
    const optKey = slugifyKey(label, usedOptionKeys);
    map[optKey] = label;
  });
  return map;
}

function cloneDrafts(drafts: readonly QuickQuestionDraft[]): QuickQuestionDraft[] {
  return drafts.map((d) => ({
    ...d,
    choiceOptions: d.choiceOptions.map((opt) => ({ ...opt })),
    scoreCriteria: [...d.scoreCriteria],
  }));
}

function createEmptyDraft(index: number): QuickQuestionDraft {
  return {
    id: `qp-custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    key: `Pergunta ${index}`,
    type: 'choice',
    instructions: '',
    choiceOptions: [
      { key: 'Sim', description: 'Atende ao critério' },
      { key: 'Não', description: 'Não atende ao critério' },
    ],
    scoreCriteria: ['Insuficiente', 'Parcial', 'Atende', 'Excepcional'],
    noulTrue: '',
    noulFalse: '',
  };
}

function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function humanizeSlug(raw: string): string {
  const cleaned = raw.replace(/[_-]+/g, ' ').trim();
  if (!cleaned) return raw;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function QuickPlayground({
  apiKey,
  hasServerKey,
  onOpenApiKeyDialog,
}: {
  apiKey: string;
  hasServerKey: boolean;
  onOpenApiKeyDialog: () => void;
}) {
  const initialPreset = QUICK_PRESETS[0];
  const stateTextareaId = useId();
  const fileInputId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [activePresetId, setActivePresetId] = useState<string | null>(initialPreset.id);
  const [stateText, setStateText] = useState<string>(initialPreset.state);
  const [drafts, setDrafts] = useState<QuickQuestionDraft[]>(() =>
    cloneDrafts(initialPreset.questions),
  );
  const [attachedFile, setAttachedFile] = useState<{ name: string; size: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileHint, setFileHint] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [needsKeyHint, setNeedsKeyHint] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRun, setLastRun] = useState<RunSnapshot | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const builtQuestions = useMemo(() => buildQuickQuestionsPayload(drafts), [drafts]);
  const builtKeys = useMemo(() => Object.keys(builtQuestions), [builtQuestions]);

  const currentSignature = useMemo(
    () =>
      JSON.stringify({
        state: stateText.trim(),
        questions: builtQuestions,
      }),
    [stateText, builtQuestions],
  );

  const isStale = Boolean(lastRun && lastRun.signature !== currentSignature);
  const hasAnyKey = Boolean(apiKey.trim() || hasServerKey);

  const confirmReplaceIfNeeded = (actionLabel: string): boolean => {
    const hasUnsavedWork = activePresetId === null || lastRun !== null;
    if (!hasUnsavedWork) return true;
    return window.confirm(
      `Você tem alterações ou resultados ativos na tela. Deseja realmente ${actionLabel}?`,
    );
  };

  const handleLoadPreset = (presetId: string) => {
    if (activePresetId === presetId) return;
    const preset = QUICK_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    if (!confirmReplaceIfNeeded(`carregar o modelo "${preset.label}"`)) return;
    setActivePresetId(preset.id);
    setStateText(preset.state);
    setDrafts(cloneDrafts(preset.questions));
    setAttachedFile(null);
    setFileHint(null);
    setErrorMsg(null);
    setNeedsKeyHint(false);
    setLastRun(null);
  };

  const handleClearState = () => {
    if (!confirmReplaceIfNeeded('limpar o texto da vaga e do currículo')) return;
    setActivePresetId(null);
    setStateText('');
    setAttachedFile(null);
    setFileHint(null);
    setErrorMsg(null);
    setLastRun(null);
    textareaRef.current?.focus();
  };

  const handleFile = async (file: File) => {
    setFileHint(null);
    setErrorMsg(null);

    const ext = getFileExtension(file.name);
    if (UNSUPPORTED_DOC_EXTENSIONS.has(ext)) {
      setFileHint(
        'Arquivos PDF ou Word ainda não podem ser lidos automaticamente. Copie o texto do documento e cole diretamente no campo abaixo.',
      );
      return;
    }

    if (!ALLOWED_EXTENSIONS.has(ext)) {
      setFileHint(
        `Formato "${ext || 'desconhecido'}" não aceito. Importe um arquivo de texto (.txt, .md ou .csv) de até 10 MB.`,
      );
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      setFileHint(
        `O arquivo "${file.name}" (${formatFileSize(file.size)}) ultrapassa o limite de 10 MB.`,
      );
      return;
    }

    try {
      const content = await file.text();
      setActivePresetId(null);
      setStateText(content);
      setAttachedFile({ name: file.name, size: file.size });
      if (content.length > MAX_STATE_CHARS) {
        setFileHint(
          `Arquivo carregado com ${content.length.toLocaleString('pt-BR')} caracteres. Reduza o texto para no máximo ${MAX_STATE_CHARS.toLocaleString('pt-BR')} caracteres antes de analisar.`,
        );
      }
    } catch {
      setFileHint('Não foi possível ler o arquivo selecionado.');
    }
  };

  const updateDraft = (id: string, updater: (draft: QuickQuestionDraft) => QuickQuestionDraft) => {
    setActivePresetId(null);
    setDrafts((prev) => prev.map((d) => (d.id === id ? updater(d) : d)));
  };

  const handleAddQuestion = () => {
    if (drafts.length >= 128) return;
    setActivePresetId(null);
    setDrafts((prev) => [...prev, createEmptyDraft(prev.length + 1)]);
  };

  const handleRemoveQuestion = (id: string) => {
    if (drafts.length <= 1) return;
    setActivePresetId(null);
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  };

  const validateBeforeRun = (): string | null => {
    const trimmedState = stateText.trim();
    if (!trimmedState) {
      return 'Cole a descrição da vaga e o currículo no Passo 1 antes de analisar.';
    }
    if (trimmedState.length > MAX_STATE_CHARS) {
      return `O texto ultrapassa o limite de ${MAX_STATE_CHARS.toLocaleString('pt-BR')} caracteres.`;
    }
    if (drafts.length === 0) {
      return 'Adicione pelo menos uma pergunta no Passo 2.';
    }

    for (let i = 0; i < drafts.length; i += 1) {
      const d = drafts[i];
      if (!d.instructions.trim()) {
        return `Escreva a pergunta #${i + 1} antes de analisar.`;
      }
      if (d.type === 'choice' && d.choiceOptions.length < 2) {
        return `A pergunta #${i + 1} (Múltipla escolha) precisa de pelo menos 2 opções.`;
      }
      if (d.type === 'score') {
        const validLevels = d.scoreCriteria.filter((c) => c.trim().length > 0);
        if (validLevels.length < 2 || validLevels.length > 10) {
          return `A pergunta #${i + 1} (Escala de nota) precisa ter de 2 a 10 níveis preenchidos.`;
        }
      }
    }

    return null;
  };

  const handleRun = useCallback(async () => {
    if (isLoading) return;
    setErrorMsg(null);
    setNeedsKeyHint(false);

    const validationError = validateBeforeRun();
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);

    const snapshotDrafts = drafts;
    const snapshotKeys = builtKeys;
    const snapshotSignature = currentSignature;

    try {
      const response = await decideWithSubq(
        {
          state: stateText.trim(),
          questions: builtQuestions,
        },
        {
          apiKey: apiKey.trim() || undefined,
          signal: controller.signal,
        },
      );

      const answersByDraftId: Record<string, SubqAnswer> = {};
      const choiceLabelsByDraftId: Record<string, Record<string, string>> = {};
      snapshotDrafts.forEach((d, idx) => {
        const key = snapshotKeys[idx];
        if (key && response.answers[key]) {
          answersByDraftId[d.id] = response.answers[key];
          if (d.type === 'choice') {
            choiceLabelsByDraftId[d.id] = buildChoiceLabelMap(d);
          }
        }
      });

      setLastRun({
        signature: snapshotSignature,
        response,
        answersByDraftId,
        choiceLabelsByDraftId,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      if (err instanceof SubqApiError) {
        setErrorMsg(err.message);
        if (err.status === 401 || err.code === 'missing_api_key') {
          setNeedsKeyHint(true);
        }
      } else {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'Não foi possível concluir a análise no momento. Tente novamente em instantes.',
        );
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setIsLoading(false);
    }
  }, [apiKey, builtKeys, builtQuestions, currentSignature, drafts, isLoading, stateText]);

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void handleRun();
    }
  };

  const charCount = stateText.length;
  const overCharLimit = charCount > MAX_STATE_CHARS;

  return (
    <section onKeyDown={handleKeyDown} className="space-y-6 pb-8">
      {/* Top header + preset strip */}
      <div className="flex flex-col gap-4 border-b border-[var(--sq-rule)] pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl space-y-1.5">
            <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--sq-content-primary)] sm:text-[26px]">
              Triagem Rápida de Currículo
            </h1>
            <p className="text-sm leading-relaxed text-[var(--sq-content-secondary)]">
              Cole uma vaga e um currículo (ou notas de entrevista) para fazer perguntas objetivas
              de triagem e receber recomendações com grau de confiança.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <PillButton
              variant="ghost"
              onClick={handleClearState}
              title="Limpar texto"
            >
              <Eraser className="h-3.5 w-3.5" />
              <span>Limpar</span>
            </PillButton>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[var(--sq-content-secondary)]">
            Modelos prontos:
          </span>
          {QUICK_PRESETS.map((preset) => (
            <PillButton
              key={preset.id}
              active={activePresetId === preset.id}
              onClick={() => handleLoadPreset(preset.id)}
              title={preset.description}
            >
              {preset.label}
            </PillButton>
          ))}
        </div>
      </div>

      {errorMsg ? (
        <AlertBanner
          tone="error"
          title="Não foi possível concluir a análise"
          onDismiss={() => setErrorMsg(null)}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{errorMsg}</span>
            {needsKeyHint ? (
              <PillButton variant="default" onClick={onOpenApiKeyDialog}>
                <KeyRound className="h-3.5 w-3.5" />
                <span>Configurar acesso</span>
              </PillButton>
            ) : null}
          </div>
        </AlertBanner>
      ) : null}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Step 1: Job + Resume */}
        <SurfaceCard focusTone="blue" className="flex min-w-0 flex-col p-5 lg:col-span-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <StepBadge step={1} tone="blue" />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[var(--sq-content-primary)]">
                  Vaga e Currículo
                </h2>
                <p className="text-[11px] text-[var(--sq-content-secondary)]">
                  Cole a descrição da vaga, o currículo ou arraste um arquivo de texto.
                </p>
              </div>
            </div>

            <div>
              <input
                ref={fileInputRef}
                id={fileInputId}
                type="file"
                accept=".txt,.md,.csv,.json,.pdf,.doc,.docx"
                className="visually-hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    void handleFile(file);
                  }
                  e.target.value = '';
                }}
              />
              <PillButton
                variant="default"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Importar arquivo</span>
              </PillButton>
            </div>
          </div>

          {attachedFile ? (
            <div className="mb-2.5 flex items-center justify-between gap-2 rounded-[6px] border border-[var(--accent-blue)] bg-[var(--accent-blue-soft)] px-2.5 py-1.5 text-xs">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--accent-blue)]" />
                <span className="truncate font-medium">{attachedFile.name}</span>
                <span className="shrink-0 text-[10px] text-[var(--sq-content-secondary)]">
                  {formatFileSize(attachedFile.size)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAttachedFile(null)}
                aria-label="Remover indicador de arquivo"
                className="inline-flex min-h-7 min-w-7 cursor-pointer items-center justify-center rounded p-1 text-[var(--sq-content-secondary)] hover:text-[var(--sq-content-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-blue)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}

          {fileHint ? (
            <div className="mb-2.5">
              <AlertBanner tone="warning" onDismiss={() => setFileHint(null)}>
                {fileHint}
              </AlertBanner>
            </div>
          ) : null}

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) {
                void handleFile(file);
              }
            }}
            className={`relative flex-1 rounded-[8px] transition ${
              isDragging
                ? 'ring-2 ring-[var(--accent-blue)] ring-offset-2 ring-offset-[var(--sq-surface-raised)]'
                : ''
            }`}
          >
            <label htmlFor={stateTextareaId} className="visually-hidden">
              Descrição da vaga e currículo do candidato
            </label>
            <textarea
              ref={textareaRef}
              id={stateTextareaId}
              value={stateText}
              onChange={(e) => {
                setActivePresetId(null);
                setStateText(e.target.value);
              }}
              rows={16}
              placeholder="Cole aqui a descrição da vaga, o currículo ou anotações da entrevista..."
              className="sq-input min-h-[320px] resize-y p-3.5 font-sans text-sm leading-relaxed"
            />
          </div>

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="text-[var(--sq-content-secondary)]">
              Aceita .txt, .md e .csv (para PDF ou Word, copie e cole o texto acima)
            </span>
            <span
              className={`tabular-nums ${
                overCharLimit
                  ? 'font-semibold text-[var(--accent-red)]'
                  : 'text-[var(--sq-content-secondary)]'
              }`}
            >
              {charCount.toLocaleString('pt-BR')} / 200.000 caracteres
            </span>
          </div>
        </SurfaceCard>

        {/* Step 2: Screening Questions & Answers */}
        <SurfaceCard focusTone="orange" className="flex min-w-0 flex-col p-5 lg:col-span-7">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <StepBadge step={2} tone="orange" />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[var(--sq-content-primary)]">
                  Perguntas de Triagem
                </h2>
                <p className="text-[11px] text-[var(--sq-content-secondary)]">
                  Escolha perguntas de múltipla escolha, escala de nota ou Sim/Não e veja o nível
                  de confiança de cada resposta.
                </p>
              </div>
            </div>

            <PillButton onClick={handleAddQuestion} disabled={drafts.length >= 128}>
              <Plus className="h-3.5 w-3.5" />
              <span>Adicionar pergunta</span>
            </PillButton>
          </div>

          {/* Status strip when results exist */}
          {lastRun ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[var(--sq-rule-strong)] bg-[var(--sq-surface-secondary)] px-3.5 py-2 text-xs">
              <span className="font-medium text-[var(--sq-content-primary)]">
                Análise concluída para {drafts.length}{' '}
                {drafts.length === 1 ? 'pergunta' : 'perguntas'}
              </span>
              {isStale ? (
                <span className="rounded-full border border-[var(--accent-gold)] bg-[var(--accent-gold-soft)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--sq-content-primary)]">
                  Alterado após a análise — clique em Analisar novamente
                </span>
              ) : (
                <span className="rounded-full border border-[var(--accent-green)] bg-[var(--accent-green-soft)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--accent-green)]">
                  Atualizado
                </span>
              )}
            </div>
          ) : null}

          <div className="space-y-4">
            {drafts.map((draft, idx) => {
              const answer = lastRun?.answersByDraftId[draft.id];
              const typeLabels: Array<{ type: SubqQuestionType; label: string }> = [
                { type: 'choice', label: 'Múltipla escolha' },
                { type: 'score', label: 'Escala de nota' },
                { type: 'noul', label: 'Sim ou Não' },
              ];

              return (
                <div
                  key={draft.id}
                  className="space-y-3 rounded-[8px] border border-[var(--sq-rule-strong)] bg-[var(--sq-surface-primary)] p-4"
                >
                  {/* Question header */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold text-[var(--accent-orange)]">
                        #{idx + 1}
                      </span>
                      <input
                        type="text"
                        value={draft.key}
                        onChange={(e) =>
                          updateDraft(draft.id, (d) => ({ ...d, key: e.target.value }))
                        }
                        aria-label={`Título da pergunta ${idx + 1}`}
                        placeholder="Título da pergunta (ex.: Decisão de triagem)"
                        className="sq-input sq-input--orange w-56 max-w-full min-w-0 px-2.5 py-1 text-xs font-medium"
                      />
                    </div>

                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <div
                        role="radiogroup"
                        aria-label={`Formato da pergunta ${idx + 1}`}
                        className="inline-flex flex-wrap rounded-full border border-[var(--sq-rule-strong)] bg-[var(--sq-surface-secondary)] p-0.5"
                      >
                        {typeLabels.map((item) => {
                          const selected = draft.type === item.type;
                          return (
                            <button
                              key={item.type}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              onClick={() =>
                                updateDraft(draft.id, (d) => ({ ...d, type: item.type }))
                              }
                              className={`cursor-pointer rounded-full px-2.5 py-0.5 text-[11px] font-medium transition ${
                                selected
                                  ? 'bg-[var(--sq-content-primary)] text-[var(--sq-surface-primary)]'
                                  : 'text-[var(--sq-content-secondary)] hover:text-[var(--sq-content-primary)]'
                              }`}
                            >
                              {item.label}
                            </button>
                          );
                        })}
                      </div>

                      {drafts.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveQuestion(draft.id)}
                          aria-label={`Remover pergunta ${idx + 1}`}
                          className="cursor-pointer rounded p-1 text-[var(--sq-content-secondary)] hover:bg-[var(--accent-red-soft)] hover:text-[var(--accent-red)]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Instructions */}
                  <div>
                    <textarea
                      value={draft.instructions}
                      onChange={(e) =>
                        updateDraft(draft.id, (d) => ({ ...d, instructions: e.target.value }))
                      }
                      rows={2}
                      aria-label={`Pergunta ${idx + 1}`}
                      placeholder="Escreva o que você quer avaliar sobre este candidato..."
                      className="sq-input sq-input--orange resize-y px-3 py-2 text-sm"
                    />
                  </div>

                  {/* Type-specific criteria editor */}
                  {draft.type === 'choice' ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-[var(--sq-content-secondary)]">
                          Opções de resposta ({draft.choiceOptions.length})
                        </span>
                        <PillButton
                          variant="ghost"
                          onClick={() =>
                            updateDraft(draft.id, (d) => ({
                              ...d,
                              choiceOptions: [
                                ...d.choiceOptions,
                                { key: `Opção ${d.choiceOptions.length + 1}`, description: '' },
                              ],
                            }))
                          }
                        >
                          <Plus className="h-3 w-3" />
                          <span>Adicionar opção</span>
                        </PillButton>
                      </div>

                      <div className="space-y-1.5">
                        {draft.choiceOptions.map((opt, optIdx) => (
                          <div key={optIdx} className="flex min-w-0 flex-wrap items-center gap-2">
                            <input
                              type="text"
                              value={opt.key}
                              onChange={(e) =>
                                updateDraft(draft.id, (d) => ({
                                  ...d,
                                  choiceOptions: d.choiceOptions.map((o, i) =>
                                    i === optIdx ? { ...o, key: e.target.value } : o,
                                  ),
                                }))
                              }
                              aria-label={`Nome da opção ${optIdx + 1}`}
                              placeholder={`Opção ${optIdx + 1}`}
                              className="sq-input sq-input--orange w-full min-w-0 px-2.5 py-1 text-xs font-medium sm:w-40"
                            />
                            <input
                              type="text"
                              value={opt.description}
                              onChange={(e) =>
                                updateDraft(draft.id, (d) => ({
                                  ...d,
                                  choiceOptions: d.choiceOptions.map((o, i) =>
                                    i === optIdx ? { ...o, description: e.target.value } : o,
                                  ),
                                }))
                              }
                              aria-label={`Quando escolher a opção ${optIdx + 1}`}
                              placeholder="Quando escolher esta opção (opcional)..."
                              className="sq-input sq-input--orange min-w-0 flex-1 px-2.5 py-1 text-xs sm:min-w-[180px]"
                            />
                            {draft.choiceOptions.length > 2 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  updateDraft(draft.id, (d) => ({
                                    ...d,
                                    choiceOptions: d.choiceOptions.filter((_, i) => i !== optIdx),
                                  }))
                                }
                                aria-label={`Remover opção ${optIdx + 1}`}
                                className="cursor-pointer rounded p-1 text-[var(--sq-content-secondary)] hover:text-[var(--accent-red)]"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {draft.type === 'score' ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-[var(--sq-content-secondary)]">
                          Níveis da escala ({draft.scoreCriteria.length}/10)
                        </span>
                        <PillButton
                          variant="ghost"
                          disabled={draft.scoreCriteria.length >= 10}
                          onClick={() =>
                            updateDraft(draft.id, (d) => ({
                              ...d,
                              scoreCriteria: [...d.scoreCriteria, `Nível ${d.scoreCriteria.length + 1}`],
                            }))
                          }
                        >
                          <Plus className="h-3 w-3" />
                          <span>Adicionar nível</span>
                        </PillButton>
                      </div>
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {draft.scoreCriteria.map((level, levelIdx) => (
                          <div key={levelIdx} className="flex min-w-0 items-center gap-1.5">
                            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--sq-surface-secondary)] font-mono text-[11px] text-[var(--sq-content-secondary)]">
                              {levelIdx + 1}
                            </span>
                            <input
                              type="text"
                              value={level}
                              onChange={(e) =>
                                updateDraft(draft.id, (d) => ({
                                  ...d,
                                  scoreCriteria: d.scoreCriteria.map((c, i) =>
                                    i === levelIdx ? e.target.value : c,
                                  ),
                                }))
                              }
                              aria-label={`Nome do nível ${levelIdx + 1}`}
                              className="sq-input sq-input--orange min-w-0 flex-1 px-2.5 py-1 text-xs"
                            />
                            {draft.scoreCriteria.length > 2 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  updateDraft(draft.id, (d) => ({
                                    ...d,
                                    scoreCriteria: d.scoreCriteria.filter((_, i) => i !== levelIdx),
                                  }))
                                }
                                aria-label={`Remover nível ${levelIdx + 1}`}
                                className="cursor-pointer rounded p-1 text-[var(--sq-content-secondary)] hover:text-[var(--accent-red)]"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {draft.type === 'noul' ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="min-w-0">
                        <label
                          htmlFor={`${draft.id}-noul-true`}
                          className="mb-1 block text-[11px] font-medium text-[var(--sq-content-secondary)]"
                        >
                          Quando considerar "Sim" (opcional)
                        </label>
                        <input
                          id={`${draft.id}-noul-true`}
                          type="text"
                          value={draft.noulTrue}
                          onChange={(e) =>
                            updateDraft(draft.id, (d) => ({ ...d, noulTrue: e.target.value }))
                          }
                          placeholder="Ex.: Cumpre todos os requisitos obrigatórios..."
                          className="sq-input sq-input--orange px-2.5 py-1 text-xs"
                        />
                      </div>
                      <div className="min-w-0">
                        <label
                          htmlFor={`${draft.id}-noul-false`}
                          className="mb-1 block text-[11px] font-medium text-[var(--sq-content-secondary)]"
                        >
                          Quando considerar "Não" (opcional)
                        </label>
                        <input
                          id={`${draft.id}-noul-false`}
                          type="text"
                          value={draft.noulFalse}
                          onChange={(e) =>
                            updateDraft(draft.id, (d) => ({ ...d, noulFalse: e.target.value }))
                          }
                          placeholder="Ex.: Faltam informações ou não atende..."
                          className="sq-input sq-input--orange px-2.5 py-1 text-xs"
                        />
                      </div>
                    </div>
                  ) : null}

                  {/* Answer panel */}
                  {answer ? (
                    <div
                      className={`mt-2 border-t border-[var(--sq-rule)] pt-3 transition-opacity ${
                        isStale ? 'opacity-55' : ''
                      }`}
                    >
                      <AnswerRenderer
                        answer={answer}
                        muted={isStale}
                        choiceLabelMap={lastRun?.choiceLabelsByDraftId[draft.id]}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </SurfaceCard>
      </div>

      {/* Sticky bottom action bar */}
      <div className="sticky bottom-4 z-20">
        <div className="mx-auto flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[var(--sq-rule-strong)] bg-[var(--sq-surface-raised)]/95 px-4 py-3 shadow-lg backdrop-blur-md">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--sq-content-secondary)]">
            <span>
              {drafts.length} {drafts.length === 1 ? 'pergunta configurada' : 'perguntas configuradas'}
            </span>
            {!hasAnyKey ? (
              <PillButton variant="ghost" onClick={onOpenApiKeyDialog}>
                <KeyRound className="h-3.5 w-3.5 text-[var(--accent-orange)]" />
                <span>Configurar chave de acesso</span>
              </PillButton>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {isLoading ? (
              <PillButton variant="danger" onClick={handleCancel}>
                <Square className="h-3.5 w-3.5" />
                <span>Cancelar</span>
              </PillButton>
            ) : null}

            <PillButton
              variant="primary"
              disabled={isLoading || overCharLimit}
              onClick={() => void handleRun()}
              className="px-4 py-2 text-xs"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Analisando currículo...</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  <span>Analisar Currículo</span>
                </>
              )}
            </PillButton>
          </div>
        </div>
      </div>
    </section>
  );
}

function AnswerRenderer({
  answer,
  muted,
  choiceLabelMap,
}: {
  answer: SubqAnswer;
  muted: boolean;
  choiceLabelMap?: Record<string, string>;
}) {
  if (answer.type === 'choice') {
    return <ChoiceAnswerView answer={answer} muted={muted} choiceLabelMap={choiceLabelMap} />;
  }
  if (answer.type === 'score') {
    return <ScoreAnswerView answer={answer} muted={muted} />;
  }
  return <NoulAnswerView answer={answer} muted={muted} />;
}

function ChoiceAnswerView({
  answer,
  muted,
  choiceLabelMap,
}: {
  answer: SubqChoiceAnswer;
  muted: boolean;
  choiceLabelMap?: Record<string, string>;
}) {
  const normalized = normaliseProbabilities(answer.probabilities);
  const sorted = Object.entries(normalized).sort(([, a], [, b]) => b - a);
  const resolveLabel = (slug: string) => choiceLabelMap?.[slug] ?? humanizeSlug(slug);

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-[var(--sq-content-secondary)]">
            Recomendação:
          </span>
          <span className="rounded bg-[var(--accent-orange-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--accent-orange)]">
            {resolveLabel(answer.choice)}
          </span>
        </div>
        <span className="text-[11px] text-[var(--sq-content-secondary)]">
          Confiança:{' '}
          <strong className="text-[var(--sq-content-primary)]">
            {formatPercent(answer.confidence, 0)}
          </strong>
        </span>
      </div>

      <div className="space-y-2">
        {sorted.map(([option, prob], index) => (
          <ProbabilityBar
            key={option}
            label={resolveLabel(option)}
            probability={prob}
            isTop={option === answer.choice || index === 0}
            muted={muted}
          />
        ))}
      </div>
    </div>
  );
}

function ScoreAnswerView({ answer, muted }: { answer: SubqScoreAnswer; muted: boolean }) {
  const normalized = normaliseProbabilities(answer.probabilities);
  const legendEntries = Object.entries(answer.legend).sort(
    ([a], [b]) => Number(a) - Number(b),
  );
  const topKey = Object.entries(normalized).sort(([, a], [, b]) => b - a)[0]?.[0];

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-[var(--sq-content-secondary)]">
            Nota estimada:
          </span>
          <span className="rounded bg-[var(--accent-blue-soft)] px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-[var(--accent-blue)]">
            {formatDecimal(answer.score + 1, 1)} / {Math.max(2, legendEntries.length)}
          </span>
        </div>
        <span className="text-[11px] text-[var(--sq-content-secondary)]">
          Confiança:{' '}
          <strong className="text-[var(--sq-content-primary)]">
            {formatPercent(answer.confidence, 0)}
          </strong>
        </span>
      </div>

      <div className="space-y-2">
        {legendEntries.length > 0
          ? legendEntries.map(([idxKey, label]) => (
              <ProbabilityBar
                key={idxKey}
                label={label}
                probability={normalized[idxKey] ?? 0}
                isTop={idxKey === topKey}
                muted={muted}
              />
            ))
          : Object.entries(normalized).map(([idxKey, prob]) => (
              <ProbabilityBar
                key={idxKey}
                label={`Nível ${Number(idxKey) + 1}`}
                probability={prob}
                isTop={idxKey === topKey}
                muted={muted}
              />
            ))}
      </div>
    </div>
  );
}

function NoulAnswerView({ answer, muted }: { answer: SubqNoulAnswer; muted: boolean }) {
  const pTrue = Number.isFinite(answer.noul) ? Math.min(1, Math.max(0, answer.noul)) : 0;
  const pFalse = 1 - pTrue;
  const likelyTrue = pTrue >= 0.5;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-[var(--sq-content-secondary)]">
            Resultado:
          </span>
          <span
            style={{
              background: likelyTrue ? 'var(--accent-green-soft)' : 'var(--accent-red-soft)',
              color: likelyTrue ? 'var(--accent-green)' : 'var(--accent-red)',
            }}
            className="rounded px-2 py-0.5 text-xs font-semibold tabular-nums"
          >
            {likelyTrue ? `Sim (${formatPercent(pTrue, 0)})` : `Não (${formatPercent(pFalse, 0)})`}
          </span>
        </div>
      </div>

      {/* Gauge bar with 50% midpoint threshold marker */}
      <div className={`space-y-1.5 ${muted ? 'opacity-55' : ''}`}>
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-[var(--sq-surface-secondary)]">
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{
              width: `${pTrue * 100}%`,
              background: likelyTrue ? 'var(--accent-green)' : 'var(--accent-orange)',
            }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-[var(--sq-content-primary)] opacity-70"
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ProbabilityBar label="Sim" probability={pTrue} isTop={likelyTrue} muted={muted} />
          <ProbabilityBar label="Não" probability={pFalse} isTop={!likelyTrue} muted={muted} />
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Eraser,
  FlaskConical,
  KeyRound,
  Loader2,
  Play,
  Plus,
  Square,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import type { SubqQuestion } from '../types/subq';
import {
  ALLOCATION,
  analyzeStochasticEvaluation,
  fsum,
  type StochasticEvaluationResult,
} from '../stochastic/consensus';
import {
  DEFAULT_GRADE_UTILITIES,
  DEFAULT_RUBRIC_GRADES,
  STOCHASTIC_PRESETS,
  SYNTHETIC_DEMO_DATA,
  type StochasticCandidate,
  type StochasticCriterion,
  type StochasticEvaluator as EvaluatorConfig,
} from '../data/presets';
import { SubqApiError, decideWithSubq, normaliseProbabilities } from '../lib/snap';
import { formatDecimal, formatPercent, slugifyKey } from '../lib/format';
import { AlertBanner, PillButton, StepBadge, SurfaceCard } from './ui';
import { BeliefMatrixModal } from './BeliefMatrixModal';
import { ConsensusResults, type ApiRunTelemetry } from './ConsensusResults';

type ElicitationMode = 'score_plus_noul' | 'score_only';

const ALLOWED_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.json']);
const UNSUPPORTED_DOC_EXTENSIONS = new Set(['.pdf', '.doc', '.docx']);
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_STATE_JSON_CHARS = 200_000;
const CONCURRENCY_LIMIT = 2;

interface EvaluationSession {
  sourceMode: 'subq-snap-1.2' | 'synthetic-local';
  elicitationMode?: ElicitationMode;
  apiTelemetry: ApiRunTelemetry | null;
  configSignature: string;
  vagaTexto: string;
  candidates: StochasticCandidate[];
  criteria: StochasticCriterion[];
  grades: string[];
  gradeUtilities: number[];
  evaluators: EvaluatorConfig[];
  originalMatrices: number[][][][];
  workingMatrices: number[][][][];
}

interface ProgressState {
  completed: number;
  total: number;
  currentLabel: string;
  inputTokens: number;
  totalLatencyMs: number;
}

function cloneTensor(tensor: number[][][][]): number[][][][] {
  return tensor.map((evalMat) =>
    evalMat.map((candRow) => candRow.map((cell) => [...cell])),
  );
}

function cloneCandidates(items: readonly StochasticCandidate[]): StochasticCandidate[] {
  return items.map((c) => ({ ...c }));
}

function cloneCriteria(items: readonly StochasticCriterion[]): StochasticCriterion[] {
  return items.map((c) => ({ ...c }));
}

function cloneEvaluators(items: readonly EvaluatorConfig[]): EvaluatorConfig[] {
  return items.map((e) => ({ ...e }));
}

function buildLinearUtilities(count: number): number[] {
  if (count <= 1) return [0];
  return Array.from({ length: count }, (_, idx) =>
    Number((idx / (count - 1)).toFixed(4)),
  );
}

function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

function buildConfigSignature(params: {
  vagaTexto: string;
  candidates: readonly StochasticCandidate[];
  criteria: readonly StochasticCriterion[];
  grades: readonly string[];
  evaluators: readonly EvaluatorConfig[];
  elicitationMode: ElicitationMode;
}): string {
  return JSON.stringify({
    vagaTexto: params.vagaTexto.trim(),
    candidates: params.candidates.map((c) => ({
      name: c.name.trim(),
      summary: c.summary.trim(),
      dossier: c.dossier.trim(),
    })),
    criteria: params.criteria.map((c) => ({
      label: c.label.trim(),
      description: c.description.trim(),
    })),
    grades: params.grades.map((g) => g.trim()),
    evaluators: params.evaluators.map((e) => ({
      name: e.name.trim(),
      role: e.role.trim(),
      focusPrompt: e.focusPrompt.trim(),
    })),
    elicitationMode: params.elicitationMode,
  });
}

function buildEvaluatorCandidateRequest(params: {
  vagaTexto: string;
  candidate: StochasticCandidate;
  evaluator: EvaluatorConfig;
  criteria: readonly StochasticCriterion[];
  grades: readonly string[];
  elicitationMode: ElicitationMode;
}): {
  payload: {
    model: 'subq-snap-1.2';
    state: Record<string, unknown>;
    questions: Record<string, SubqQuestion>;
  };
  questionPairs: Array<{ scoreKey: string; noulKey: string }>;
} {
  const { vagaTexto, candidate, evaluator, criteria, grades, elicitationMode } = params;

  const state: Record<string, unknown> = {
    papel_avaliador: evaluator.name.trim() || 'Avaliador',
    especialidade: evaluator.role.trim() || 'Banca de Seleção',
    diretriz_avaliacao:
      evaluator.focusPrompt.trim() ||
      'Avalie com rigor utilizando apenas evidências explícitas no currículo e notas da entrevista.',
    vaga: vagaTexto.trim(),
    candidato: {
      nome: candidate.name.trim() || 'Candidato',
      resumo: candidate.summary.trim(),
      dossie: candidate.dossier.trim(),
    },
    criterios: criteria.map((c, idx) => ({
      ordem: idx + 1,
      criterio: c.label.trim() || `Critério ${idx + 1}`,
      descricao: c.description.trim(),
    })),
    escala_rubrica: grades.map((g) => g.trim()),
  };

  const questions: Record<string, SubqQuestion> = {};
  const questionPairs: Array<{ scoreKey: string; noulKey: string }> = [];
  const usedSlugs = new Set<string>();

  criteria.forEach((criterion, idx) => {
    const label = criterion.label.trim() || `Critério ${idx + 1}`;
    const critSlug = slugifyKey(label, usedSlugs);
    const scoreKey = `nota_${critSlug}`.slice(0, 100);
    const noulKey = `suficiencia_${critSlug}`.slice(0, 100);

    const scoreInstructions =
      `[${evaluator.name.trim() || 'Avaliador'}] Avalie "${candidate.name.trim() || 'Candidato'}" no critério "${label}"` +
      (criterion.description.trim() ? ` (${criterion.description.trim()})` : '') +
      `. Diretriz: ${evaluator.focusPrompt.trim() || 'Avaliação objetiva baseada apenas nas evidências do currículo.'}`;

    questions[scoreKey] = {
      type: 'score',
      instructions: scoreInstructions.slice(0, 3900),
      criteria: grades.map((g) => g.trim()),
    };

    if (elicitationMode === 'score_plus_noul') {
      const noulInstructions =
        `[${evaluator.name.trim() || 'Avaliador'}] Há evidência suficiente e concreta no currículo de "${candidate.name.trim() || 'Candidato'}" para avaliar o critério "${label}" sem suposições?`;
      questions[noulKey] = {
        type: 'noul',
        instructions: noulInstructions.slice(0, 3900),
        criteria: {
          true: 'O material traz evidências diretas, concretas e verificáveis para este critério.',
          false:
            'Há lacunas relevantes, ambiguidade ou ausência de evidências concretas sobre este critério.',
        },
      };
    }

    questionPairs.push({ scoreKey, noulKey });
  });

  return {
    payload: {
      model: 'subq-snap-1.2',
      state,
      questions,
    },
    questionPairs,
  };
}

function validateStrictUtilities(utilities: readonly number[]): string | null {
  if (utilities.length < 2) return 'A escala precisa ter pelo menos 2 níveis.';
  for (let n = 0; n < utilities.length; n += 1) {
    const val = utilities[n];
    if (!Number.isFinite(val) || val < 0 || val > 1) {
      return `A pontuação do nível #${n + 1} deve estar entre 0 e 100 pontos.`;
    }
    if (n > 0 && val <= utilities[n - 1]) {
      return 'As pontuações dos níveis devem ser crescentes do menor para o maior.';
    }
  }
  return null;
}

function tensorsDiffer(a: number[][][][], b: number[][][][]): boolean {
  if (a.length !== b.length) return true;
  for (let k = 0; k < a.length; k += 1) {
    if (a[k].length !== b[k].length) return true;
    for (let i = 0; i < a[k].length; i += 1) {
      if (a[k][i].length !== b[k][i].length) return true;
      for (let j = 0; j < a[k][i].length; j += 1) {
        if (a[k][i][j].length !== b[k][i][j].length) return true;
        for (let n = 0; n < a[k][i][j].length; n += 1) {
          if (Math.abs(a[k][i][j][n] - b[k][i][j][n]) > 1e-6) return true;
        }
      }
    }
  }
  return false;
}

const AGREEMENT_PRESETS = [
  {
    value: 0.7,
    label: 'Flexível (70%)',
    description: 'Mais tolerante a diferenças entre avaliadores',
  },
  {
    value: 0.8,
    label: 'Equilibrado (80%)',
    description: 'Recomendado para a maioria das vagas',
  },
  {
    value: 0.9,
    label: 'Rigoroso (90%)',
    description: 'Exige forte alinhamento de toda a banca',
  },
] as const;

export function StochasticEvaluator({
  apiKey,
  hasServerKey,
  autoLoadDemo = false,
  exploreDemoNonce = 0,
  onOpenApiKeyDialog,
}: {
  apiKey: string;
  hasServerKey: boolean;
  autoLoadDemo?: boolean;
  exploreDemoNonce?: number;
  onOpenApiKeyDialog: () => void;
}) {
  const initialPreset = STOCHASTIC_PRESETS[0];
  const vagaId = useId();
  const candNameId = useId();
  const candSummaryId = useId();
  const candDossierId = useId();
  const alphaId = useId();
  const thresholdId = useId();
  const trialsId = useId();
  const seedId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsSectionRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToResults = useCallback(() => {
    window.requestAnimationFrame(() => {
      resultsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const [activePresetId, setActivePresetId] = useState<string | null>(initialPreset.id);
  const [vagaTexto, setVagaTexto] = useState<string>(initialPreset.vagaTexto);
  const [candidates, setCandidates] = useState<StochasticCandidate[]>(() =>
    cloneCandidates(initialPreset.candidates),
  );
  const [selectedCandidateIdx, setSelectedCandidateIdx] = useState(0);
  const [criteria, setCriteria] = useState<StochasticCriterion[]>(() =>
    cloneCriteria(initialPreset.criteria),
  );
  const [grades, setGrades] = useState<string[]>(() => [...initialPreset.grades]);
  const [gradeUtilities, setGradeUtilities] = useState<number[]>(() => [
    ...initialPreset.gradeUtilities,
  ]);
  const [evaluators, setEvaluators] = useState<EvaluatorConfig[]>(() =>
    cloneEvaluators(initialPreset.evaluators),
  );
  const [elicitationMode, setElicitationMode] = useState<ElicitationMode>('score_plus_noul');

  // Analysis parameters
  const [alpha, setAlpha] = useState<number>(0.5);
  const [threshold, setThreshold] = useState<number>(0.8);
  const [trials, setTrials] = useState<1000 | 4000 | 10000>(4000);
  const [seed, setSeed] = useState<number>(42);

  // Runtime & results state
  const [fileHint, setFileHint] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [needsKeyHint, setNeedsKeyHint] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [session, setSession] = useState<EvaluationSession | null>(null);
  const [beliefModalOpen, setBeliefModalOpen] = useState(false);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const totalWeight = useMemo(
    () => criteria.reduce((sum, c) => sum + Math.max(0, c.weight), 0),
    [criteria],
  );

  const normalizedWeights = useMemo(() => {
    if (criteria.length === 0) return [];
    if (totalWeight <= 0) return criteria.map(() => 1 / criteria.length);
    return criteria.map((c) => Math.max(0, c.weight) / totalWeight);
  }, [criteria, totalWeight]);

  const utilityValidationError = useMemo(
    () => validateStrictUtilities(gradeUtilities),
    [gradeUtilities],
  );

  const safeCandIdx = Math.min(selectedCandidateIdx, Math.max(0, candidates.length - 1));

  const currentConfigSignature = useMemo(
    () =>
      buildConfigSignature({
        vagaTexto,
        candidates,
        criteria,
        grades,
        evaluators,
        elicitationMode,
      }),
    [vagaTexto, candidates, criteria, grades, evaluators, elicitationMode],
  );

  const isSessionStale = Boolean(
    session &&
      session.sourceMode === 'subq-snap-1.2' &&
      session.configSignature !== currentConfigSignature,
  );

  const hasReviewerEdits = useMemo(() => {
    if (!session) return false;
    return tensorsDiffer(session.originalMatrices, session.workingMatrices);
  }, [session]);

  const evaluationResult: {
    result: StochasticEvaluationResult | null;
    error: string | null;
  } = useMemo(() => {
    if (!session) return { result: null, error: null };
    try {
      const sameCriteriaCount = criteria.length === session.criteria.length;
      const sameGradesCount = grades.length === session.grades.length;
      const useLiveWeights = sameCriteriaCount && totalWeight > 0;
      const useLiveUtilities = sameGradesCount && utilityValidationError === null;

      const res = analyzeStochasticEvaluation({
        input: {
          matrices: session.workingMatrices,
          alpha,
          threshold,
          trials,
          seed: Number.isInteger(seed) && seed >= 0 ? seed : 42,
          allocation: { ...ALLOCATION },
        },
        attributeWeights: useLiveWeights
          ? normalizedWeights
          : session.criteria.map((c) => Math.max(0, c.weight)),
        gradeUtilities: useLiveUtilities ? gradeUtilities : session.gradeUtilities,
      });

      return { result: res, error: null };
    } catch (err) {
      return {
        result: null,
        error: err instanceof Error ? err.message : 'Não foi possível calcular o resultado.',
      };
    }
  }, [
    session,
    alpha,
    threshold,
    trials,
    seed,
    criteria.length,
    grades.length,
    totalWeight,
    normalizedWeights,
    utilityValidationError,
    gradeUtilities,
  ]);

  const confirmReplaceIfNeeded = (actionLabel: string): boolean => {
    const hasUnsavedWork =
      activePresetId === null || (session !== null && session.sourceMode === 'subq-snap-1.2');
    if (!hasUnsavedWork) return true;
    return window.confirm(
      `Você tem alterações ou resultados ativos na tela. Deseja realmente ${actionLabel}?`,
    );
  };

  const handleLoadPreset = (presetId: string) => {
    if (activePresetId === presetId) return;
    const preset = STOCHASTIC_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    if (!confirmReplaceIfNeeded(`carregar o exemplo "${preset.title}"`)) return;
    setActivePresetId(preset.id);
    setVagaTexto(preset.vagaTexto);
    setCandidates(cloneCandidates(preset.candidates));
    setSelectedCandidateIdx(0);
    setCriteria(cloneCriteria(preset.criteria));
    setGrades([...preset.grades]);
    setGradeUtilities([...preset.gradeUtilities]);
    setEvaluators(cloneEvaluators(preset.evaluators));
    setFileHint(null);
    setErrorMsg(null);
    setNeedsKeyHint(false);
    setSession(null);
  };

  const autoLoadedRef = useRef(false);

  const loadSyntheticDemoSession = useCallback(
    (shouldScroll: boolean) => {
      setActivePresetId('synthetic-local');
      setVagaTexto(SYNTHETIC_DEMO_DATA.vagaTexto);
      setCandidates(cloneCandidates(SYNTHETIC_DEMO_DATA.candidates));
      setSelectedCandidateIdx(0);
      setCriteria(cloneCriteria(SYNTHETIC_DEMO_DATA.criteria));
      setGrades([...SYNTHETIC_DEMO_DATA.grades]);
      setGradeUtilities([...SYNTHETIC_DEMO_DATA.gradeUtilities]);
      setEvaluators(cloneEvaluators(SYNTHETIC_DEMO_DATA.evaluators));
      setAlpha(SYNTHETIC_DEMO_DATA.input.alpha);
      setThreshold(SYNTHETIC_DEMO_DATA.input.threshold);
      setTrials(4000);
      setSeed(SYNTHETIC_DEMO_DATA.input.seed);
      setFileHint(null);
      setErrorMsg(null);
      setNeedsKeyHint(false);

      const orig = cloneTensor(SYNTHETIC_DEMO_DATA.input.matrices);
      setSession({
        sourceMode: 'synthetic-local',
        apiTelemetry: null,
        configSignature: buildConfigSignature({
          vagaTexto: SYNTHETIC_DEMO_DATA.vagaTexto,
          candidates: SYNTHETIC_DEMO_DATA.candidates,
          criteria: SYNTHETIC_DEMO_DATA.criteria,
          grades: SYNTHETIC_DEMO_DATA.grades,
          evaluators: SYNTHETIC_DEMO_DATA.evaluators,
          elicitationMode,
        }),
        vagaTexto: SYNTHETIC_DEMO_DATA.vagaTexto,
        candidates: cloneCandidates(SYNTHETIC_DEMO_DATA.candidates),
        criteria: cloneCriteria(SYNTHETIC_DEMO_DATA.criteria),
        grades: [...SYNTHETIC_DEMO_DATA.grades],
        gradeUtilities: [...SYNTHETIC_DEMO_DATA.gradeUtilities],
        evaluators: cloneEvaluators(SYNTHETIC_DEMO_DATA.evaluators),
        originalMatrices: orig,
        workingMatrices: cloneTensor(orig),
      });
      if (shouldScroll) {
        scrollToResults();
      }
    },
    [elicitationMode, scrollToResults],
  );

  useEffect(() => {
    if (autoLoadDemo && !autoLoadedRef.current && session === null) {
      autoLoadedRef.current = true;
      loadSyntheticDemoSession(false);
    }
  }, [autoLoadDemo, session, loadSyntheticDemoSession]);

  useEffect(() => {
    if (exploreDemoNonce > 0) {
      if (session === null) {
        loadSyntheticDemoSession(true);
      } else {
        scrollToResults();
      }
    }
  }, [exploreDemoNonce, session, loadSyntheticDemoSession, scrollToResults]);

  const handleLoadSyntheticDemo = () => {
    if (
      activePresetId !== 'synthetic-local' &&
      !confirmReplaceIfNeeded('carregar o exemplo pronto de demonstração')
    ) {
      return;
    }
    loadSyntheticDemoSession(true);
  };

  const handleClear = () => {
    if (!confirmReplaceIfNeeded('limpar todos os campos da vaga e dos candidatos')) return;
    setActivePresetId(null);
    setVagaTexto('');
    setCandidates([
      {
        id: `cand-${Date.now()}`,
        name: 'Candidato 1',
        summary: '',
        dossier: '',
      },
    ]);
    setSelectedCandidateIdx(0);
    setCriteria([
      {
        id: `crit-${Date.now()}`,
        label: 'Aderência Técnica',
        description: 'Experiência prática nos requisitos principais da vaga.',
        weight: 1,
      },
    ]);
    setGrades([...DEFAULT_RUBRIC_GRADES]);
    setGradeUtilities([...DEFAULT_GRADE_UTILITIES]);
    setEvaluators([
      {
        id: `eval-${Date.now()}-1`,
        name: 'Gestor da Vaga',
        role: 'Liderança Técnica',
        focusPrompt: 'Avalie evidências práticas e autonomia nos requisitos centrais da vaga.',
      },
      {
        id: `eval-${Date.now()}-2`,
        name: 'Recrutamento & Cultura',
        role: 'RH / Pessoas',
        focusPrompt: 'Avalie comunicação, colaboração, trajetória e alinhamento com a equipe.',
      },
    ]);
    setFileHint(null);
    setErrorMsg(null);
    setNeedsKeyHint(false);
    setSession(null);
  };

  const handleCandidateDossierFile = async (file: File) => {
    setFileHint(null);
    const ext = getFileExtension(file.name);
    if (UNSUPPORTED_DOC_EXTENSIONS.has(ext)) {
      setFileHint(
        'Arquivos PDF ou Word ainda não podem ser lidos automaticamente. Copie o texto do currículo e cole diretamente no campo abaixo.',
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
      setFileHint(`O arquivo "${file.name}" ultrapassa o limite de 10 MB.`);
      return;
    }

    try {
      const content = await file.text();
      setActivePresetId(null);
      setCandidates((prev) =>
        prev.map((c, idx) => (idx === safeCandIdx ? { ...c, dossier: content } : c)),
      );
    } catch {
      setFileHint('Não foi possível ler o arquivo selecionado.');
    }
  };

  const validateInputsBeforeApi = (): string | null => {
    if (!vagaTexto.trim()) {
      return 'Preencha a descrição da vaga no Passo 1 antes de iniciar a avaliação.';
    }
    if (candidates.length < 1 || candidates.length > 6) {
      return 'Adicione entre 1 e 6 candidatos para avaliar.';
    }
    for (let i = 0; i < candidates.length; i += 1) {
      if (!candidates[i].name.trim() || !candidates[i].dossier.trim()) {
        return `Preencha o nome e o currículo do candidato #${i + 1}.`;
      }
    }
    if (criteria.length < 1 || criteria.length > 8) {
      return 'Defina entre 1 e 8 critérios de avaliação.';
    }
    if (totalWeight <= 0) {
      return 'Defina importância maior que zero para pelo menos um critério.';
    }
    for (let j = 0; j < criteria.length; j += 1) {
      if (!criteria[j].label.trim()) {
        return `Informe o nome do critério #${j + 1}.`;
      }
    }
    if (grades.length < 2 || grades.length > 6) {
      return 'A escala de notas deve ter entre 2 e 6 níveis.';
    }
    if (grades.some((g) => !g.trim())) {
      return 'Todos os níveis da escala precisam ter um nome preenchido.';
    }
    if (utilityValidationError) {
      return utilityValidationError;
    }
    if (evaluators.length < 2 || evaluators.length > 6) {
      return 'A banca precisa ter entre 2 e 6 avaliadores para calcular o acordo.';
    }
    for (let k = 0; k < evaluators.length; k += 1) {
      if (!evaluators[k].name.trim()) {
        return `Informe o nome do avaliador #${k + 1}.`;
      }
    }
    return null;
  };

  const handleRunEvaluation = useCallback(async () => {
    if (isRunning) return;
    setErrorMsg(null);
    setNeedsKeyHint(false);

    const validationError = validateInputsBeforeApi();
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    const tasks: Array<{ k: number; i: number }> = [];
    for (let k = 0; k < evaluators.length; k += 1) {
      for (let i = 0; i < candidates.length; i += 1) {
        tasks.push({ k, i });
      }
    }

    for (const { k, i } of tasks) {
      const { payload } = buildEvaluatorCandidateRequest({
        vagaTexto,
        candidate: candidates[i],
        evaluator: evaluators[k],
        criteria,
        grades,
        elicitationMode,
      });
      if (JSON.stringify(payload.state).length > MAX_STATE_JSON_CHARS) {
        setErrorMsg(
          `O texto combinado para ${evaluators[k].name} × ${candidates[i].name} é muito longo. Reduza um pouco o currículo ou a descrição da vaga.`,
        );
        return;
      }
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setIsRunning(true);
    setProgress({
      completed: 0,
      total: tasks.length,
      currentLabel: `${evaluators[0].name} avaliando ${candidates[0].name}`,
      inputTokens: 0,
      totalLatencyMs: 0,
    });

    const K = evaluators.length;
    const M = candidates.length;
    const L = criteria.length;
    const N = grades.length;

    const tensor: number[][][][] = Array.from({ length: K }, () =>
      Array.from({ length: M }, () =>
        Array.from({ length: L }, () => new Array<number>(N).fill(0)),
      ),
    );

    let nextTaskIndex = 0;
    let completedCount = 0;
    let totalTokens = 0;
    let totalLatency = 0;
    let capturedError: unknown = null;

    const worker = async () => {
      while (true) {
        if (controller.signal.aborted || capturedError) return;
        const idx = nextTaskIndex;
        nextTaskIndex += 1;
        if (idx >= tasks.length) return;

        const { k, i } = tasks[idx];
        const evaluator = evaluators[k];
        const candidate = candidates[i];

        setProgress((prev) =>
          prev
            ? {
                ...prev,
                currentLabel: `${evaluator.name} avaliando ${candidate.name}`,
              }
            : null,
        );

        const { payload, questionPairs } = buildEvaluatorCandidateRequest({
          vagaTexto,
          candidate,
          evaluator,
          criteria,
          grades,
          elicitationMode,
        });

        try {
          const response = await decideWithSubq(
            { state: payload.state, questions: payload.questions },
            { apiKey: apiKey.trim() || undefined, signal: controller.signal },
          );

          for (let j = 0; j < L; j += 1) {
            const { scoreKey, noulKey } = questionPairs[j];
            const scoreAns = response.answers[scoreKey];
            if (!scoreAns || scoreAns.type !== 'score') {
              throw new Error(
                `Resposta incompleta ao avaliar ${candidate.name} (${evaluator.name}). Tente novamente.`,
              );
            }

            const rawProbs: Record<string, number> = {};
            for (let n = 0; n < N; n += 1) {
              rawProbs[String(n)] = scoreAns.probabilities[String(n)] ?? 0;
            }
            const normProbs = normaliseProbabilities(rawProbs);
            let pVec = Array.from({ length: N }, (_, n) => normProbs[String(n)] ?? 0);
            if (fsum(pVec) <= 0) {
              pVec = Array.from({ length: N }, () => 1 / N);
            }

            let ev = 1;
            if (elicitationMode === 'score_plus_noul') {
              const noulAns = response.answers[noulKey];
              if (!noulAns || noulAns.type !== 'noul') {
                throw new Error(
                  `Não foi possível verificar as evidências para ${candidate.name} (${evaluator.name}). Tente novamente.`,
                );
              }
              ev = Math.min(1, Math.max(0, noulAns.noul));
            } else {
              ev = Math.min(1, Math.max(0, scoreAns.confidence));
            }

            const rawCell = pVec.map((pn) => Math.max(0, ev * pn));
            const cellSum = fsum(rawCell);
            tensor[k][i][j] =
              cellSum > 1 ? rawCell.map((val) => val / cellSum) : rawCell;
          }

          completedCount += 1;
          totalTokens += response.usage?.input_tokens ?? 0;
          totalLatency += response.latency_ms ?? 0;

          setProgress({
            completed: completedCount,
            total: tasks.length,
            currentLabel: `${evaluator.name} avaliando ${candidate.name}`,
            inputTokens: totalTokens,
            totalLatencyMs: totalLatency,
          });
        } catch (err) {
          if (!controller.signal.aborted) {
            capturedError = err;
            controller.abort();
          }
          return;
        }
      }
    };

    try {
      const workers = Array.from(
        { length: Math.min(CONCURRENCY_LIMIT, tasks.length) },
        () => worker(),
      );
      await Promise.all(workers);

      if (capturedError) {
        throw capturedError;
      }

      if (controller.signal.aborted) {
        return;
      }

      const snapCandidates = cloneCandidates(candidates);
      const snapCriteria = cloneCriteria(criteria);
      const snapEvaluators = cloneEvaluators(evaluators);
      const snapGrades = [...grades];
      const snapUtilities = [...gradeUtilities];

      setSession({
        sourceMode: 'subq-snap-1.2',
        elicitationMode,
        apiTelemetry: {
          model: 'subq-snap-1.2',
          elicitationMode,
          completedCalls: tasks.length,
          totalCalls: tasks.length,
          inputTokens: totalTokens,
          totalLatencyMs: totalLatency,
          executedAt: new Date().toISOString(),
        },
        configSignature: buildConfigSignature({
          vagaTexto,
          candidates: snapCandidates,
          criteria: snapCriteria,
          grades: snapGrades,
          evaluators: snapEvaluators,
          elicitationMode,
        }),
        vagaTexto,
        candidates: snapCandidates,
        criteria: snapCriteria,
        grades: snapGrades,
        gradeUtilities: snapUtilities,
        evaluators: snapEvaluators,
        originalMatrices: cloneTensor(tensor),
        workingMatrices: cloneTensor(tensor),
      });
      scrollToResults();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      if (err instanceof SubqApiError) {
        if (err.code === 'missing_api_key' || err.status === 401) {
          setNeedsKeyHint(true);
        }
        setErrorMsg(err.message);
      } else {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'Não foi possível concluir a avaliação no momento. Tente novamente em instantes.',
        );
      }
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  }, [
    isRunning,
    vagaTexto,
    candidates,
    criteria,
    grades,
    gradeUtilities,
    evaluators,
    elicitationMode,
    apiKey,
    totalWeight,
    utilityValidationError,
    scrollToResults,
  ]);

  const handleCancelRun = () => {
    abortRef.current?.abort();
    setIsRunning(false);
    setProgress(null);
  };

  const activeCandidate = candidates[safeCandIdx];

  return (
    <div className="min-w-0 space-y-6 pb-10">
      {/* Top Bar */}
      <div className="flex flex-col gap-4 border-b border-[var(--sq-rule)] pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-1.5">
            <h2 className="font-display text-xl font-bold tracking-tight text-[var(--sq-content-primary)] sm:text-2xl">
              Avaliação Comparativa de Candidatos
            </h2>
            <p className="text-sm leading-relaxed text-[var(--sq-content-secondary)]">
              Compare candidatos usando uma banca com diferentes pontos de vista, identifique onde
              faltam informações no currículo e visualize o nível de acordo antes de decidir quem
              avança no processo seletivo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <PillButton variant="ghost" onClick={handleClear}>
              <Eraser className="h-3.5 w-3.5" />
              <span>Limpar tudo</span>
            </PillButton>
          </div>
        </div>

        {/* Preset Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[var(--sq-content-secondary)]">
            Vagas de exemplo:
          </span>
          {STOCHASTIC_PRESETS.map((preset) => (
            <PillButton
              key={preset.id}
              active={activePresetId === preset.id}
              onClick={() => handleLoadPreset(preset.id)}
              title={preset.subtitle}
            >
              {preset.title}
            </PillButton>
          ))}
          <PillButton
            active={activePresetId === 'synthetic-local'}
            onClick={handleLoadSyntheticDemo}
          >
            <FlaskConical className="h-3.5 w-3.5" />
            <span>Ver exemplo pronto</span>
          </PillButton>
        </div>
      </div>

      {/* PASSO 1 (Azul): Vaga, Candidatos e Critérios */}
      <SurfaceCard focusTone="blue" className="min-w-0 p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <StepBadge step={1} tone="blue" />
            <div>
              <h2 className="font-display text-lg font-bold text-[var(--sq-content-primary)]">
                Vaga, Candidatos e Critérios
              </h2>
              <p className="text-xs text-[var(--sq-content-secondary)]">
                Descreva a vaga, adicione até 6 candidatos e escolha os critérios mais importantes
                para a contratação.
              </p>
            </div>
          </div>
          <span className="rounded-full border border-[var(--sq-rule)] bg-[var(--sq-surface-secondary)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--sq-content-secondary)]">
            {candidates.length} {candidates.length === 1 ? 'candidato' : 'candidatos'} ·{' '}
            {criteria.length} {criteria.length === 1 ? 'critério' : 'critérios'}
          </span>
        </div>

        <div className="space-y-6">
          {/* Job Description */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor={vagaId}
                className="text-xs font-semibold text-[var(--sq-content-primary)]"
              >
                Descrição da Vaga e Requisitos
              </label>
              <span className="text-[11px] tabular-nums text-[var(--sq-content-secondary)]">
                {vagaTexto.length.toLocaleString('pt-BR')} caracteres
              </span>
            </div>
            <textarea
              id={vagaId}
              rows={5}
              value={vagaTexto}
              onChange={(e) => {
                setActivePresetId(null);
                setVagaTexto(e.target.value);
              }}
              placeholder="Cole aqui a descrição da vaga, responsabilidades, requisitos obrigatórios e diferenciais..."
              className="sq-input p-3 text-sm leading-relaxed"
            />
          </div>

          {/* Candidates (1..6) */}
          <div className="space-y-3 rounded-[10px] border border-[var(--sq-rule)] bg-[var(--sq-surface-primary)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[var(--sq-content-primary)]">
                Candidatos ({candidates.length}/6)
              </h3>
              <PillButton
                onClick={() => {
                  if (candidates.length >= 6) return;
                  setActivePresetId(null);
                  const nextIdx = candidates.length;
                  setCandidates((prev) => [
                    ...prev,
                    {
                      id: `cand-${Date.now()}-${nextIdx}`,
                      name: `Candidato ${nextIdx + 1}`,
                      summary: '',
                      dossier: '',
                    },
                  ]);
                  setSelectedCandidateIdx(nextIdx);
                }}
                disabled={candidates.length >= 6}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Adicionar candidato</span>
              </PillButton>
            </div>

            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Candidatos">
              {candidates.map((cand, idx) => (
                <PillButton
                  key={cand.id}
                  role="tab"
                  aria-selected={safeCandIdx === idx}
                  active={safeCandIdx === idx}
                  onClick={() => setSelectedCandidateIdx(idx)}
                >
                  {cand.name.trim() || `Candidato ${idx + 1}`}
                </PillButton>
              ))}
            </div>

            {activeCandidate ? (
              <div className="space-y-3 border-t border-[var(--sq-rule)] pt-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="min-w-0 space-y-1">
                    <label
                      htmlFor={candNameId}
                      className="text-[11px] font-medium text-[var(--sq-content-secondary)]"
                    >
                      Nome do candidato
                    </label>
                    <input
                      id={candNameId}
                      type="text"
                      value={activeCandidate.name}
                      onChange={(e) => {
                        setActivePresetId(null);
                        const val = e.target.value;
                        setCandidates((prev) =>
                          prev.map((c, idx) => (idx === safeCandIdx ? { ...c, name: val } : c)),
                        );
                      }}
                      className="sq-input px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <label
                      htmlFor={candSummaryId}
                      className="text-[11px] font-medium text-[var(--sq-content-secondary)]"
                    >
                      Resumo rápido (opcional)
                    </label>
                    <div className="flex min-w-0 items-center gap-2">
                      <input
                        id={candSummaryId}
                        type="text"
                        value={activeCandidate.summary}
                        onChange={(e) => {
                          setActivePresetId(null);
                          const val = e.target.value;
                          setCandidates((prev) =>
                            prev.map((c, idx) =>
                              idx === safeCandIdx ? { ...c, summary: val } : c,
                            ),
                          );
                        }}
                        placeholder="Ex.: Perfil sênior, boa comunicação, faltam detalhes de liderança"
                        className="sq-input min-w-0 flex-1 px-3 py-1.5 text-sm"
                      />
                      <PillButton
                        variant="danger"
                        disabled={candidates.length <= 1}
                        title="Remover candidato"
                        aria-label={`Remover candidato ${activeCandidate.name || safeCandIdx + 1}`}
                        onClick={() => {
                          if (candidates.length <= 1) return;
                          setActivePresetId(null);
                          setCandidates((prev) => prev.filter((_, idx) => idx !== safeCandIdx));
                          setSelectedCandidateIdx((prev) => Math.max(0, prev - 1));
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </PillButton>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label
                      htmlFor={candDossierId}
                      className="text-[11px] font-medium text-[var(--sq-content-secondary)]"
                    >
                      Currículo, Histórico e Notas da Entrevista
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] text-[var(--sq-content-secondary)]">
                        PDF ou Word? Copie e cole o texto abaixo.
                      </span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".txt,.md,.csv,.json,.pdf,.doc,.docx"
                        className="visually-hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleCandidateDossierFile(f);
                          e.target.value = '';
                        }}
                      />
                      <PillButton
                        variant="ghost"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="h-3.5 w-3.5" />
                        <span>Importar arquivo (.txt, .md, .csv)</span>
                      </PillButton>
                    </div>
                  </div>

                  {fileHint ? (
                    <AlertBanner tone="warning" onDismiss={() => setFileHint(null)}>
                      {fileHint}
                    </AlertBanner>
                  ) : null}

                  <textarea
                    id={candDossierId}
                    rows={5}
                    value={activeCandidate.dossier}
                    onChange={(e) => {
                      setActivePresetId(null);
                      const val = e.target.value;
                      setCandidates((prev) =>
                        prev.map((c, idx) => (idx === safeCandIdx ? { ...c, dossier: val } : c)),
                      );
                    }}
                    placeholder="Cole o currículo, experiências relevantes e suas anotações da entrevista..."
                    className="sq-input p-3 text-sm leading-relaxed"
                  />
                </div>
              </div>
            ) : null}
          </div>

          {/* Criteria (1..8) */}
          <div className="space-y-3 rounded-[10px] border border-[var(--sq-rule)] bg-[var(--sq-surface-primary)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-[var(--sq-content-primary)]">
                  Critérios da Vaga ({criteria.length}/8)
                </h3>
                <p className="text-[11px] text-[var(--sq-content-secondary)]">
                  Ajuste a importância de cada critério. Os percentuais são equilibrados
                  automaticamente para somar 100%.
                </p>
              </div>
              <PillButton
                disabled={criteria.length >= 8}
                onClick={() => {
                  if (criteria.length >= 8) return;
                  setActivePresetId(null);
                  setCriteria((prev) => [
                    ...prev,
                    {
                      id: `crit-${Date.now()}-${prev.length}`,
                      label: `Critério ${prev.length + 1}`,
                      description: '',
                      weight: 0.25,
                    },
                  ]);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Adicionar critério</span>
              </PillButton>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {criteria.map((crit, j) => {
                const normW = normalizedWeights[j] ?? 0;
                return (
                  <div
                    key={crit.id}
                    className="rounded-[8px] border border-[var(--sq-rule)] bg-[var(--sq-surface-raised)] p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={crit.label}
                        aria-label={`Nome do critério ${j + 1}`}
                        onChange={(e) => {
                          setActivePresetId(null);
                          const val = e.target.value;
                          setCriteria((prev) =>
                            prev.map((c, idx) => (idx === j ? { ...c, label: val } : c)),
                          );
                        }}
                        className="sq-input min-w-0 flex-1 px-2.5 py-1 text-xs font-semibold"
                      />
                      <span className="rounded-full border border-[var(--sq-rule)] bg-[var(--sq-surface-secondary)] px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--sq-content-primary)]">
                        Peso: {formatPercent(normW, 0)}
                      </span>
                      <PillButton
                        variant="ghost"
                        disabled={criteria.length <= 1}
                        aria-label={`Remover critério ${crit.label}`}
                        onClick={() => {
                          if (criteria.length <= 1) return;
                          setActivePresetId(null);
                          setCriteria((prev) => prev.filter((_, idx) => idx !== j));
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-[var(--accent-red)]" />
                      </PillButton>
                    </div>

                    <input
                      type="text"
                      value={crit.description}
                      aria-label={`Descrição do critério ${j + 1}`}
                      placeholder="O que observar neste critério..."
                      onChange={(e) => {
                        setActivePresetId(null);
                        const val = e.target.value;
                        setCriteria((prev) =>
                          prev.map((c, idx) => (idx === j ? { ...c, description: val } : c)),
                        );
                      }}
                      className="sq-input mt-2 px-2.5 py-1 text-xs"
                    />

                    <div className="mt-2.5 flex min-w-0 items-center gap-3">
                      <span className="shrink-0 text-[11px] text-[var(--sq-content-secondary)]">
                        Importância
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={crit.weight}
                        aria-label={`Importância do critério ${crit.label}`}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setCriteria((prev) =>
                            prev.map((c, idx) => (idx === j ? { ...c, weight: val } : c)),
                          );
                        }}
                        className="min-w-0 flex-1"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Collapsible Scale Customization */}
          <details className="group rounded-[10px] border border-[var(--sq-rule)] bg-[var(--sq-surface-primary)]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-xs font-semibold text-[var(--sq-content-primary)] select-none">
              <span>
                Personalizar escala de notas ({grades.join(' → ')})
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-[var(--sq-content-secondary)] transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-3 border-t border-[var(--sq-rule)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-[var(--sq-content-secondary)]">
                  Defina de 2 a 6 níveis ordenados do menor para o maior desempenho. A pontuação ao
                  lado (0 a 100) define o valor de cada nível.
                </p>
                <div className="flex items-center gap-1.5">
                  <PillButton
                    variant="ghost"
                    onClick={() => setGradeUtilities(buildLinearUtilities(grades.length))}
                  >
                    Distribuir igualmente
                  </PillButton>
                  <PillButton
                    disabled={grades.length >= 6}
                    onClick={() => {
                      if (grades.length >= 6) return;
                      setActivePresetId(null);
                      const nextGrades = [...grades, `Nível ${grades.length + 1}`];
                      setGrades(nextGrades);
                      setGradeUtilities(buildLinearUtilities(nextGrades.length));
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Adicionar nível</span>
                  </PillButton>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {grades.map((gradeLabel, n) => (
                  <div
                    key={`grade-${n}`}
                    className="flex min-w-0 items-center gap-2 rounded-[8px] border border-[var(--sq-rule)] bg-[var(--sq-surface-raised)] p-2"
                  >
                    <span className="shrink-0 font-mono text-[11px] text-[var(--sq-content-secondary)]">
                      #{n + 1}
                    </span>
                    <input
                      type="text"
                      value={gradeLabel}
                      aria-label={`Nome do nível ${n + 1}`}
                      onChange={(e) => {
                        setActivePresetId(null);
                        const val = e.target.value;
                        setGrades((prev) => prev.map((g, idx) => (idx === n ? val : g)));
                      }}
                      className="sq-input min-w-0 flex-1 px-2.5 py-1 text-xs"
                    />
                    <div className="flex shrink-0 items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={5}
                        value={Math.round((gradeUtilities[n] ?? 0) * 100)}
                        aria-label={`Pontuação do nível ${gradeLabel}`}
                        onChange={(e) => {
                          const val = Number(e.target.value) / 100;
                          setGradeUtilities((prev) =>
                            prev.map((u, idx) =>
                              idx === n ? (Number.isFinite(val) ? val : 0) : u,
                            ),
                          );
                        }}
                        className="sq-input w-16 px-2 py-1 font-mono text-xs tabular-nums"
                      />
                      <span className="text-[11px] text-[var(--sq-content-secondary)]">pts</span>
                    </div>
                    <PillButton
                      variant="ghost"
                      disabled={grades.length <= 2}
                      aria-label={`Remover nível ${gradeLabel}`}
                      onClick={() => {
                        if (grades.length <= 2) return;
                        setActivePresetId(null);
                        const nextGrades = grades.filter((_, idx) => idx !== n);
                        setGrades(nextGrades);
                        setGradeUtilities(buildLinearUtilities(nextGrades.length));
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-[var(--accent-red)]" />
                    </PillButton>
                  </div>
                ))}
              </div>

              {utilityValidationError ? (
                <AlertBanner tone="error">{utilityValidationError}</AlertBanner>
              ) : null}
            </div>
          </details>
        </div>
      </SurfaceCard>

      {/* PASSO 2 (Laranja): Banca de Avaliadores */}
      <SurfaceCard focusTone="orange" className="min-w-0 p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <StepBadge step={2} tone="orange" />
            <div>
              <h2 className="font-display text-lg font-bold text-[var(--sq-content-primary)]">
                Banca de Avaliadores
              </h2>
              <p className="text-xs text-[var(--sq-content-secondary)]">
                Configure de 2 a 6 perfis com pontos de vista diferentes (ex.: Gestor, RH, Negócio)
                para avaliar os candidatos e medir o acordo da banca.
              </p>
            </div>
          </div>

          <PillButton
            disabled={evaluators.length >= 6}
            onClick={() => {
              if (evaluators.length >= 6) return;
              setActivePresetId(null);
              const nextIdx = evaluators.length;
              setEvaluators((prev) => [
                ...prev,
                {
                  id: `eval-${Date.now()}-${nextIdx}`,
                  name: `Avaliador ${nextIdx + 1}`,
                  role: 'Especialista',
                  focusPrompt:
                    'Avalie evidências concretas do currículo sob o ponto de vista da sua área.',
                },
              ]);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Adicionar avaliador ({evaluators.length}/6)</span>
          </PillButton>
        </div>

        <div className="space-y-5">
          {/* Evaluators grid */}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {evaluators.map((evalr, k) => (
              <div
                key={evalr.id}
                className="min-w-0 rounded-[10px] border border-[var(--sq-rule)] bg-[var(--sq-surface-primary)] p-3.5"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--sq-content-secondary)]">
                    <Users className="h-3.5 w-3.5 text-[var(--accent-orange)]" />
                    <span>Avaliador #{k + 1}</span>
                  </div>
                  <PillButton
                    variant="ghost"
                    disabled={evaluators.length <= 2}
                    aria-label={`Remover avaliador ${evalr.name}`}
                    onClick={() => {
                      if (evaluators.length <= 2) return;
                      setActivePresetId(null);
                      setEvaluators((prev) => prev.filter((_, idx) => idx !== k));
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-[var(--accent-red)]" />
                  </PillButton>
                </div>

                <div className="space-y-2">
                  <input
                    type="text"
                    value={evalr.name}
                    aria-label={`Nome do avaliador ${k + 1}`}
                    onChange={(e) => {
                      setActivePresetId(null);
                      const val = e.target.value;
                      setEvaluators((prev) =>
                        prev.map((item, idx) => (idx === k ? { ...item, name: val } : item)),
                      );
                    }}
                    placeholder="Nome do avaliador"
                    className="sq-input sq-input--orange px-2.5 py-1.5 text-xs font-semibold"
                  />
                  <input
                    type="text"
                    value={evalr.role}
                    aria-label={`Área ou papel do avaliador ${k + 1}`}
                    onChange={(e) => {
                      setActivePresetId(null);
                      const val = e.target.value;
                      setEvaluators((prev) =>
                        prev.map((item, idx) => (idx === k ? { ...item, role: val } : item)),
                      );
                    }}
                    placeholder="Área / Papel na seleção"
                    className="sq-input sq-input--orange px-2.5 py-1 text-xs"
                  />
                  <textarea
                    rows={3}
                    value={evalr.focusPrompt}
                    aria-label={`O que o avaliador ${k + 1} prioriza`}
                    onChange={(e) => {
                      setActivePresetId(null);
                      const val = e.target.value;
                      setEvaluators((prev) =>
                        prev.map((item, idx) =>
                          idx === k ? { ...item, focusPrompt: val } : item,
                        ),
                      );
                    }}
                    placeholder="O que este avaliador deve priorizar ao analisar os candidatos..."
                    className="sq-input sq-input--orange p-2.5 text-xs leading-relaxed"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Simple HR-friendly Agreement Target selector */}
          <div className="space-y-2.5 rounded-[10px] border border-[var(--sq-rule)] bg-[var(--sq-surface-primary)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-[var(--sq-content-primary)]">
                  Nível de exigência de acordo da banca
                </p>
                <p className="text-[11px] text-[var(--sq-content-secondary)]">
                  Define o quanto os avaliadores precisam concordar entre si para considerarmos um
                  bom consenso (atualiza os resultados na hora).
                </p>
              </div>
            </div>
            <div
              role="radiogroup"
              aria-label="Nível de exigência de acordo da banca"
              className="grid gap-2 sm:grid-cols-3"
            >
              {AGREEMENT_PRESETS.map((preset) => {
                const selected = Math.abs(threshold - preset.value) < 0.001;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setThreshold(preset.value)}
                    className={`cursor-pointer rounded-[8px] border p-3 text-left transition ${
                      selected
                        ? 'border-[var(--accent-orange)] bg-[var(--accent-orange-soft)]'
                        : 'border-[var(--sq-rule)] bg-[var(--sq-surface-raised)] hover:border-[var(--sq-rule-strong)]'
                    }`}
                  >
                    <p className="text-xs font-semibold text-[var(--sq-content-primary)]">
                      {preset.label}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--sq-content-secondary)]">
                      {preset.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Collapsible Advanced Analysis Options */}
          <details className="group rounded-[10px] border border-[var(--sq-rule)] bg-[var(--sq-surface-primary)]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-xs font-semibold text-[var(--sq-content-primary)] select-none">
              <span>Opções avançadas de análise</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-[var(--sq-content-secondary)] transition-transform group-open:rotate-180" />
            </summary>

            <div className="grid gap-4 border-t border-[var(--sq-rule)] p-4 lg:grid-cols-12">
              <div className="min-w-0 space-y-2 lg:col-span-5">
                <p className="text-xs font-semibold text-[var(--sq-content-primary)]">
                  Tratamento de lacunas no currículo
                </p>
                <div className="space-y-2" role="radiogroup" aria-label="Modo de verificação de evidências">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={elicitationMode === 'score_plus_noul'}
                    onClick={() => setElicitationMode('score_plus_noul')}
                    className={`w-full cursor-pointer rounded-[8px] border p-3 text-left transition ${
                      elicitationMode === 'score_plus_noul'
                        ? 'border-[var(--accent-orange)] bg-[var(--accent-orange-soft)]'
                        : 'border-[var(--sq-rule)] bg-[var(--sq-surface-raised)] hover:border-[var(--sq-rule-strong)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[var(--sq-content-primary)]">
                        Verificar lacunas explicitamente
                      </span>
                      <span className="rounded-full border border-[var(--accent-orange)] bg-[var(--accent-orange-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--sq-content-primary)]">
                        Recomendado
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-[var(--sq-content-secondary)]">
                      Checa separadamente se o currículo traz evidências reais para cada critério,
                      evitando penalizar o candidato apenas por falta de informação.
                    </p>
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={elicitationMode === 'score_only'}
                    onClick={() => setElicitationMode('score_only')}
                    className={`w-full cursor-pointer rounded-[8px] border p-3 text-left transition ${
                      elicitationMode === 'score_only'
                        ? 'border-[var(--accent-orange)] bg-[var(--accent-orange-soft)]'
                        : 'border-[var(--sq-rule)] bg-[var(--sq-surface-raised)] hover:border-[var(--sq-rule-strong)]'
                    }`}
                  >
                    <span className="text-xs font-semibold text-[var(--sq-content-primary)]">
                      Avaliação direta (mais rápida)
                    </span>
                    <p className="mt-1 text-[11px] leading-relaxed text-[var(--sq-content-secondary)]">
                      Avalia diretamente a nota de cada critério usando a confiança da resposta como
                      indicador de suficiência de evidências.
                    </p>
                  </button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label
                      htmlFor={thresholdId}
                      className="font-medium text-[var(--sq-content-primary)]"
                    >
                      Meta de acordo personalizada
                    </label>
                    <span className="font-mono font-semibold tabular-nums text-[var(--accent-orange)]">
                      {formatPercent(threshold, 0)}
                    </span>
                  </div>
                  <input
                    id={thresholdId}
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div className="min-w-0 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor={alphaId} className="font-medium text-[var(--sq-content-primary)]">
                      Equilíbrio da divergência (α)
                    </label>
                    <span className="font-mono font-semibold tabular-nums text-[var(--accent-orange)]">
                      {formatDecimal(alpha, 2)}
                    </span>
                  </div>
                  <input
                    id={alphaId}
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={alpha}
                    onChange={(e) => setAlpha(Number(e.target.value))}
                    className="w-full"
                  />
                  <p className="text-[11px] text-[var(--sq-content-secondary)]">
                    Padrão 0,50 equilibra diferença de notas e grau de incerteza.
                  </p>
                </div>

                <div className="min-w-0 space-y-1.5">
                  <label
                    htmlFor={trialsId}
                    className="block text-xs font-medium text-[var(--sq-content-primary)]"
                  >
                    Precisão da simulação
                  </label>
                  <select
                    id={trialsId}
                    value={trials}
                    onChange={(e) => setTrials(Number(e.target.value) as 1000 | 4000 | 10000)}
                    className="sq-input sq-input--orange px-3 py-1.5 text-xs"
                  >
                    <option value={1000}>Rápida (1.000 cenários)</option>
                    <option value={4000}>Padrão (4.000 cenários)</option>
                    <option value={10000}>Alta precisão (10.000 cenários)</option>
                  </select>
                </div>

                <div className="min-w-0 space-y-1.5">
                  <label
                    htmlFor={seedId}
                    className="block text-xs font-medium text-[var(--sq-content-primary)]"
                  >
                    Semente de reprodutibilidade
                  </label>
                  <input
                    id={seedId}
                    type="number"
                    min={0}
                    step={1}
                    value={seed}
                    onChange={(e) => {
                      const v = Math.trunc(Number(e.target.value));
                      setSeed(Number.isFinite(v) && v >= 0 ? v : 0);
                    }}
                    className="sq-input sq-input--orange px-3 py-1.5 font-mono text-xs tabular-nums"
                  />
                </div>
              </div>
            </div>
          </details>
        </div>
      </SurfaceCard>

      {/* Error & Key Alerts */}
      {errorMsg ? (
        <AlertBanner
          tone="error"
          title="Não foi possível concluir a avaliação"
          onDismiss={() => {
            setErrorMsg(null);
            setNeedsKeyHint(false);
          }}
        >
          <div className="space-y-2">
            <p>{errorMsg}</p>
            {needsKeyHint ? (
              <PillButton variant="default" onClick={onOpenApiKeyDialog}>
                <KeyRound className="h-3.5 w-3.5" />
                <span>Configurar chave de acesso</span>
              </PillButton>
            ) : null}
          </div>
        </AlertBanner>
      ) : null}

      {evaluationResult.error ? (
        <AlertBanner tone="error" title="Erro ao calcular o resultado">
          {evaluationResult.error}
        </AlertBanner>
      ) : null}

      {/* Sticky Action Bar */}
      <div className="no-print sticky bottom-4 z-20 rounded-[10px] border border-[var(--sq-rule-strong)] bg-[var(--sq-surface-raised)]/95 p-3 shadow-lg backdrop-blur-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            {isRunning && progress ? (
              <div className="space-y-1" aria-live="polite">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-[var(--sq-content-primary)]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent-orange)]" />
                    <span>
                      Avaliando ({progress.completed} de {progress.total}):{' '}
                      <strong>{progress.currentLabel}</strong>
                    </span>
                  </span>
                </div>
                <progress
                  aria-label="Progresso da avaliação de candidatos"
                  value={progress.completed}
                  max={Math.max(1, progress.total)}
                  className="h-2 w-full"
                />
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--sq-content-secondary)]">
                <span>
                  Pronto para avaliar <strong>{candidates.length}</strong>{' '}
                  {candidates.length === 1 ? 'candidato' : 'candidatos'} com{' '}
                  <strong>{evaluators.length}</strong> avaliadores.
                </span>
                {!apiKey.trim() && !hasServerKey ? (
                  <button
                    type="button"
                    onClick={onOpenApiKeyDialog}
                    className="cursor-pointer font-medium text-[var(--accent-blue)] underline"
                  >
                    Configurar chave de acesso
                  </button>
                ) : null}
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <PillButton
              variant="default"
              className="max-w-full text-center"
              onClick={handleLoadSyntheticDemo}
              disabled={isRunning}
            >
              <FlaskConical className="h-3.5 w-3.5 shrink-0" />
              <span>Ver exemplo pronto</span>
            </PillButton>

            {isRunning ? (
              <PillButton variant="danger" onClick={handleCancelRun}>
                <Square className="h-3.5 w-3.5 shrink-0" />
                <span>Cancelar</span>
              </PillButton>
            ) : (
              <PillButton
                variant="primary"
                className="max-w-full text-center"
                onClick={handleRunEvaluation}
              >
                <Play className="h-3.5 w-3.5 shrink-0" />
                <span>Avaliar Candidatos</span>
              </PillButton>
            )}
          </div>
        </div>
      </div>

      {/* PASSO 3 (Verde): Resultado e Acordo da Banca */}
      <div ref={resultsSectionRef} className="scroll-mt-20">
        <SurfaceCard focusTone="green" className="min-w-0 p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <StepBadge step={3} tone="green" />
            <div>
              <h2 className="font-display text-lg font-bold text-[var(--sq-content-primary)]">
                Resultado e Acordo da Banca
              </h2>
              <p className="text-xs text-[var(--sq-content-secondary)]">
                Ranking de candidatos, nível de acordo entre os avaliadores e pontos que merecem
                atenção na entrevista.
              </p>
            </div>
          </div>
        </div>

        {session && evaluationResult.result ? (
          <ConsensusResults
            evaluation={evaluationResult.result}
            sourceMode={session.sourceMode}
            elicitationMode={session.elicitationMode}
            apiTelemetry={session.apiTelemetry}
            vagaTexto={session.vagaTexto}
            candidates={session.candidates}
            criteria={session.criteria}
            grades={session.grades}
            evaluators={session.evaluators}
            originalMatrices={session.originalMatrices}
            workingMatrices={session.workingMatrices}
            hasReviewerEdits={hasReviewerEdits}
            isStale={isSessionStale}
            onOpenBeliefModal={() => setBeliefModalOpen(true)}
            onRestoreOriginals={() =>
              setSession((prev) =>
                prev ? { ...prev, workingMatrices: cloneTensor(prev.originalMatrices) } : null,
              )
            }
          />
        ) : (
          <div className="rounded-[10px] border border-dashed border-[var(--sq-rule-strong)] bg-[var(--sq-surface-primary)] px-5 py-8 text-center">
            <p className="font-display text-base font-bold text-[var(--sq-content-primary)]">
              Nenhuma avaliação realizada ainda
            </p>
            <p className="mx-auto mt-1.5 max-w-xl text-xs leading-relaxed text-[var(--sq-content-secondary)]">
              Clique em <strong>Avaliar Candidatos</strong> para iniciar a análise completa com a
              banca, ou clique em <strong>Ver exemplo pronto</strong> para explorar o painel de
              resultados agora mesmo.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <PillButton variant="default" onClick={handleLoadSyntheticDemo}>
                <FlaskConical className="h-3.5 w-3.5" />
                <span>Ver exemplo pronto</span>
              </PillButton>
            </div>
          </div>
        )}
      </SurfaceCard>
      </div>

      {session ? (
        <BeliefMatrixModal
          open={beliefModalOpen}
          onClose={() => setBeliefModalOpen(false)}
          evaluators={session.evaluators}
          candidates={session.candidates}
          criteria={session.criteria}
          grades={session.grades}
          originalMatrices={session.originalMatrices}
          workingMatrices={session.workingMatrices}
          onApplyMatrices={(nextMatrices) =>
            setSession((prev) =>
              prev ? { ...prev, workingMatrices: cloneTensor(nextMatrices) } : null,
            )
          }
          onRestoreOriginals={() =>
            setSession((prev) =>
              prev ? { ...prev, workingMatrices: cloneTensor(prev.originalMatrices) } : null,
            )
          }
        />
      ) : null}
    </div>
  );
}

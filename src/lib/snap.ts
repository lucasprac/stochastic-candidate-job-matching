import type {
  DecideRequest,
  DecideResponse,
  HealthResponse,
  SubqAnswer,
  SubqQuestion,
} from '../types/subq';

export class SubqApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly upstreamStatus?: number;

  constructor(
    message: string,
    status: number,
    options?: { code?: string; upstreamStatus?: number },
  ) {
    super(message);
    this.name = 'SubqApiError';
    this.status = status;
    this.code = options?.code;
    this.upstreamStatus = options?.upstreamStatus;
  }
}

interface ErrorPayload {
  error?: unknown;
  code?: unknown;
  upstreamStatus?: unknown;
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function toFriendlyApiErrorMessage(
  code: string | undefined,
  status: number,
  rawMessage: string,
  fallbackMessage: string,
): string {
  switch (code) {
    case 'missing_api_key':
      return 'Configure sua chave de acesso nas Configurações para executar a avaliação com IA.';
    case 'upstream_unauthorized':
      return 'A chave de acesso informada é inválida ou expirou. Verifique nas Configurações.';
    case 'upstream_payment_required':
      return 'Saldo insuficiente na conta configurada para realizar novas avaliações.';
    case 'upstream_forbidden':
      return 'Acesso negado para a chave informada. Verifique as permissões da sua conta.';
    case 'upstream_rate_limited':
      return 'Muitas avaliações em sequência. Aguarde alguns segundos e tente novamente.';
    case 'upstream_timeout':
      return 'A avaliação demorou mais do que o esperado. Tente novamente em instantes.';
    case 'upstream_network_error':
    case 'upstream_server_error':
    case 'invalid_upstream_response':
      return 'O serviço de avaliação está temporariamente indisponível. Tente novamente em instantes.';
    case 'too_many_requests':
      return 'Já existem muitas avaliações em andamento. Aguarde a conclusão e tente novamente.';
    case 'payload_too_large':
      return 'O texto enviado é muito grande. Reduza o tamanho dos currículos ou da vaga e tente novamente.';
    case 'upstream_bad_request':
    case 'upstream_unprocessable':
      return 'Não foi possível processar os dados enviados. Revise os campos preenchidos e tente novamente.';
    default:
      break;
  }

  if (status === 401) {
    return 'Configure uma chave de acesso válida nas Configurações para continuar.';
  }
  if (status === 429) {
    return 'Muitas solicitações simultâneas. Aguarde alguns segundos e tente novamente.';
  }
  if (status >= 500) {
    return 'O serviço de avaliação está temporariamente indisponível. Tente novamente em instantes.';
  }

  const trimmed = rawMessage.trim();
  if (!trimmed || /subq|snap-1\.2|proxy|json/i.test(trimmed)) {
    return fallbackMessage;
  }
  return trimmed;
}

function buildApiError(res: Response, body: unknown, fallbackMessage: string): SubqApiError {
  const payload = (body && typeof body === 'object' ? body : {}) as ErrorPayload;
  const rawMessage = typeof payload.error === 'string' ? payload.error : '';
  const code = typeof payload.code === 'string' ? payload.code : undefined;
  const upstreamStatus =
    typeof payload.upstreamStatus === 'number' && Number.isFinite(payload.upstreamStatus)
      ? payload.upstreamStatus
      : undefined;

  const message = toFriendlyApiErrorMessage(code, res.status, rawMessage, fallbackMessage);
  return new SubqApiError(message, res.status, { code, upstreamStatus });
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch('/api/health', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  const body = await parseJsonSafe(res);
  if (!res.ok || !body || typeof body !== 'object') {
    throw buildApiError(res, body, 'Não foi possível verificar o status do serviço de avaliação.');
  }
  const health = parseHealthResponse(body);
  if (!health) {
    throw new SubqApiError(
      'Não foi possível verificar o status do serviço de avaliação.',
      res.status,
      { code: 'invalid_health_response' },
    );
  }
  return health;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isProbabilityRecord(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every(isFiniteNumber);
}

/** Runtime check for /api/health. Returns null when the body does not match the contract. */
export function parseHealthResponse(body: unknown): HealthResponse | null {
  if (!isRecord(body) || body.ok !== true || typeof body.hasServerKey !== 'boolean') {
    return null;
  }
  // Older proxies do not send `deployment`; they were always local.
  const deployment = body.deployment === 'hosted' ? 'hosted' : 'local';
  return { ok: true, model: 'subq-snap-1.2', hasServerKey: body.hasServerKey, deployment };
}

function isAnswerForQuestion(answer: unknown, question: SubqQuestion): answer is SubqAnswer {
  if (!isRecord(answer) || answer.type !== question.type) return false;
  switch (question.type) {
    case 'choice':
      return (
        typeof answer.choice === 'string' &&
        isProbabilityRecord(answer.probabilities) &&
        isFiniteNumber(answer.confidence)
      );
    case 'score':
      return (
        isFiniteNumber(answer.score) &&
        isRecord(answer.legend) &&
        Object.values(answer.legend).every((label) => typeof label === 'string') &&
        isProbabilityRecord(answer.probabilities) &&
        isFiniteNumber(answer.confidence)
      );
    case 'noul':
      return isFiniteNumber(answer.noul);
  }
}

/**
 * Runtime check for /api/decide. The response must contain one answer of the right type
 * for every question that was sent. Returns null when the body does not match the contract,
 * so a contract change fails with a clear error instead of breaking the UI later.
 */
export function parseDecideResponse(
  body: unknown,
  questions: Record<string, SubqQuestion>,
): DecideResponse | null {
  if (!isRecord(body) || !isRecord(body.answers)) return null;
  const answers: Record<string, SubqAnswer> = {};
  for (const [key, question] of Object.entries(questions)) {
    const answer = body.answers[key];
    if (!isAnswerForQuestion(answer, question)) return null;
    answers[key] = answer;
  }
  const usage = isRecord(body.usage) ? body.usage : {};
  return {
    model: 'subq-snap-1.2',
    answers,
    usage: {
      input_tokens: isFiniteNumber(usage.input_tokens) ? usage.input_tokens : 0,
      output_tokens: isFiniteNumber(usage.output_tokens) ? usage.output_tokens : 0,
    },
    latency_ms: isFiniteNumber(body.latency_ms) ? body.latency_ms : 0,
  };
}

export async function decideWithSubq(
  payload: DecideRequest,
  options?: { apiKey?: string; signal?: AbortSignal },
): Promise<DecideResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const trimmedKey = options?.apiKey?.trim();
  if (trimmedKey) {
    headers['X-SubQ-Api-Key'] = trimmedKey;
  }

  const res = await fetch('/api/decide', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: options?.signal,
  });

  const body = await parseJsonSafe(res);
  if (!res.ok || !body || typeof body !== 'object') {
    throw buildApiError(
      res,
      body,
      'Não foi possível concluir a avaliação no momento. Tente novamente em instantes.',
    );
  }

  const parsed = parseDecideResponse(body, payload.questions);
  if (!parsed) {
    throw new SubqApiError(
      'O serviço de avaliação retornou uma resposta em formato inesperado. Tente novamente em instantes.',
      502,
      { code: 'invalid_response_shape' },
    );
  }
  return parsed;
}

export function normaliseProbabilities(
  probs: Record<string, number>,
): Record<string, number> {
  const entries = Object.entries(probs);
  if (entries.length === 0) return {};

  const cleaned: Array<[string, number]> = entries.map(([key, value]) => [
    key,
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0,
  ]);
  const total = cleaned.reduce((sum, [, v]) => sum + v, 0);

  if (total <= 0) {
    return Object.fromEntries(cleaned);
  }

  return Object.fromEntries(cleaned.map(([key, v]) => [key, v / total]));
}

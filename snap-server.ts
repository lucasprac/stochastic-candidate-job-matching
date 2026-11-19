import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  DecideResponse,
  HealthResponse,
  SubqAnswer,
  SubqChoiceAnswer,
  SubqNoulAnswer,
  SubqQuestion,
  SubqScoreAnswer,
} from './src/types/subq';

export const MODEL = 'subq-snap-1.2' as const;
export const DEFAULT_UPSTREAM_URL = 'https://api.subq.ai/v1/systemone';
export const MAX_IN_FLIGHT = 6;
export const MAX_BODY_BYTES = 1024 * 1024;
export const UPSTREAM_TIMEOUT_MS = 60_000;

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const ALLOWED_SEC_FETCH_SITES = new Set(['same-origin', 'same-site', 'none']);

class HttpValidationError extends Error {
  readonly status: number;
  readonly code: string;
  readonly upstreamStatus?: number;

  constructor(status: number, code: string, message: string, upstreamStatus?: number) {
    super(message);
    this.name = 'HttpValidationError';
    this.status = status;
    this.code = code;
    this.upstreamStatus = upstreamStatus;
  }
}

export function resolveUpstreamUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const raw = env.SUBQ_API_URL?.trim();
  if (!raw) return DEFAULT_UPSTREAM_URL;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('SUBQ_API_URL inválida: informe uma URL HTTPS válida.');
  }

  const hostname = parsed.hostname.toLowerCase();
  const isAllowedHost =
    hostname === 'api.subq.ai' ||
    (hostname.endsWith('.subq.ai') && hostname.length > '.subq.ai'.length);

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !isAllowedHost) {
    throw new Error(
      'SUBQ_API_URL bloqueada: somente URLs https://*.subq.ai sem credenciais são permitidas.',
    );
  }

  return parsed.toString();
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
): void {
  if (res.writableEnded) return;
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) {
      res.setHeader(k, v);
    }
  }
  res.end(payload);
}

function getHeaderString(
  headers: IncomingMessage['headers'],
  name: string,
): string | undefined {
  const val = headers[name];
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val[0];
  return undefined;
}

function isLocalHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '[::1]' ||
    lower === '::1'
  );
}

function isValidLocalhostHostHeader(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  const trimmed = hostHeader.trim().toLowerCase();
  if (!trimmed) return false;

  if (trimmed.startsWith('[')) {
    const match = /^\[([^\]]+)\](?::(\d+))?$/.exec(trimmed);
    if (!match) return false;
    if (match[1] !== '::1') return false;
    if (match[2] !== undefined) {
      const port = Number(match[2]);
      if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
    }
    return true;
  }

  const match = /^([^:\s]+)(?::(\d+))?$/.exec(trimmed);
  if (!match) return false;
  if (match[1] !== 'localhost' && match[1] !== '127.0.0.1') return false;
  if (match[2] !== undefined) {
    const port = Number(match[2]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
  }
  return true;
}

function validateRequestOriginAndHeaders(req: IncomingMessage): void {
  const hostHeader = getHeaderString(req.headers, 'host');
  if (!isValidLocalhostHostHeader(hostHeader)) {
    throw new HttpValidationError(
      403,
      'invalid_host',
      'Cabeçalho Host não autorizado para este proxy local.',
    );
  }

  const secFetchSite = req.headers['sec-fetch-site'];
  if (Array.isArray(secFetchSite)) {
    throw new HttpValidationError(
      403,
      'forbidden_origin',
      'Cabeçalho Sec-Fetch-Site inválido.',
    );
  }
  if (typeof secFetchSite === 'string' && secFetchSite.trim() !== '') {
    if (!ALLOWED_SEC_FETCH_SITES.has(secFetchSite.trim().toLowerCase())) {
      throw new HttpValidationError(
        403,
        'forbidden_origin',
        'Requisição bloqueada pela política de origem (Sec-Fetch-Site).',
      );
    }
  }

  const originHeader = req.headers['origin'];
  if (Array.isArray(originHeader)) {
    throw new HttpValidationError(
      403,
      'forbidden_origin',
      'Cabeçalho Origin inválido.',
    );
  }
  if (typeof originHeader === 'string' && originHeader.trim() !== '') {
    const rawOrigin = originHeader.trim();
    if (rawOrigin.toLowerCase() === 'null') {
      throw new HttpValidationError(
        403,
        'forbidden_origin',
        'Origem opaca não permitida para o proxy local.',
      );
    }
    let parsed: URL;
    try {
      parsed = new URL(rawOrigin);
    } catch {
      throw new HttpValidationError(
        403,
        'forbidden_origin',
        'Cabeçalho Origin malformado.',
      );
    }
    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      !isLocalHostname(parsed.hostname)
    ) {
      throw new HttpValidationError(
        403,
        'forbidden_origin',
        'Origem não permitida para o proxy local.',
      );
    }
  }

  const contentType = getHeaderString(req.headers, 'content-type')?.trim().toLowerCase() ?? '';
  if (
    contentType !== 'application/json' &&
    !contentType.startsWith('application/json;') &&
    !contentType.startsWith('application/json ')
  ) {
    throw new HttpValidationError(
      415,
      'unsupported_media_type',
      'Content-Type deve ser application/json.',
    );
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isSafeKey(key: string): boolean {
  return key.length >= 1 && key.length <= 100 && !FORBIDDEN_KEYS.has(key);
}

function hasForbiddenKeysDeep(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasForbiddenKeysDeep(item));
  }
  if (typeof value === 'object' && value !== null) {
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(key)) return true;
      if (hasForbiddenKeysDeep((value as Record<string, unknown>)[key])) {
        return true;
      }
    }
  }
  return false;
}

const MAX_DRAIN_BYTES = MAX_BODY_BYTES * 4;

function drainRequestStream(req: IncomingMessage, res: ServerResponse): void {
  if (req.complete || req.destroyed) return;
  let drained = 0;
  let exceededCap = false;

  const cleanup = () => {
    req.removeListener('data', onDrainData);
    req.removeListener('end', cleanup);
    req.removeListener('close', cleanup);
    req.removeListener('error', onDrainError);
  };

  const destroyAfterResponse = () => {
    if (res.writableFinished) {
      cleanup();
      if (!req.destroyed) req.destroy();
    } else {
      res.once('finish', () => {
        cleanup();
        if (!req.destroyed) req.destroy();
      });
    }
  };

  const onDrainData = (chunk: Buffer | string) => {
    drained += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
    if (!exceededCap && drained > MAX_DRAIN_BYTES) {
      exceededCap = true;
      destroyAfterResponse();
    }
  };

  const onDrainError = () => {
    cleanup();
  };

  req.on('data', onDrainData);
  req.once('end', cleanup);
  req.once('close', cleanup);
  req.on('error', onDrainError);
  req.resume();
}

function readJsonBody(req: IncomingMessage, res: ServerResponse): Promise<unknown> {
  const rawLength = getHeaderString(req.headers, 'content-length');
  if (rawLength !== undefined) {
    const parsedLength = Number(rawLength);
    if (Number.isFinite(parsedLength) && parsedLength > MAX_BODY_BYTES) {
      drainRequestStream(req, res);
      return Promise.reject(
        new HttpValidationError(
          413,
          'payload_too_large',
          'Corpo da requisição excede o limite de 1 MB.',
        ),
      );
    }
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
      req.removeListener('aborted', onAborted);
      reject(err);
    };

    const onData = (chunk: Buffer | string) => {
      if (settled) return;
      const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
      totalBytes += buf.length;
      if (totalBytes > MAX_BODY_BYTES) {
        fail(
          new HttpValidationError(
            413,
            'payload_too_large',
            'Corpo da requisição excede o limite de 1 MB.',
          ),
        );
        drainRequestStream(req, res);
        return;
      }
      chunks.push(buf);
    };

    const onEnd = () => {
      if (settled) return;
      settled = true;
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
      req.removeListener('aborted', onAborted);

      const rawText = Buffer.concat(chunks).toString('utf8');
      if (!rawText.trim()) {
        reject(
          new HttpValidationError(
            400,
            'invalid_body',
            'Corpo da requisição JSON não pode estar vazio.',
          ),
        );
        return;
      }

      try {
        resolve(JSON.parse(rawText) as unknown);
      } catch {
        reject(
          new HttpValidationError(
            400,
            'invalid_json',
            'JSON inválido no corpo da requisição.',
          ),
        );
      }
    };

    const onError = () => {
      fail(
        new HttpValidationError(
          400,
          'request_stream_error',
          'Erro ao ler o corpo da requisição.',
        ),
      );
    };

    const onAborted = () => {
      fail(
        new HttpValidationError(
          400,
          'request_aborted',
          'Requisição cancelada antes da conclusão.',
        ),
      );
    };

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.on('aborted', onAborted);
  });
}

function validateDecidePayload(rawBody: unknown): {
  state: string | Record<string, unknown>;
  questions: Record<string, SubqQuestion>;
} {
  if (!isPlainObject(rawBody)) {
    throw new HttpValidationError(
      400,
      'invalid_body',
      'O corpo da requisição deve ser um objeto JSON.',
    );
  }

  const rawState = rawBody.state;
  let validatedState: string | Record<string, unknown>;

  if (typeof rawState === 'string') {
    if (rawState.trim().length < 1 || rawState.length > 200_000) {
      throw new HttpValidationError(
        400,
        'invalid_state',
        'O campo "state" deve ter entre 1 e 200.000 caracteres.',
      );
    }
    validatedState = rawState;
  } else if (isPlainObject(rawState)) {
    if (hasForbiddenKeysDeep(rawState)) {
      throw new HttpValidationError(
        400,
        'invalid_state',
        'O campo "state" contém chaves reservadas não permitidas.',
      );
    }
    const serialized = JSON.stringify(rawState);
    if (serialized.length < 2 || serialized.length > 200_000) {
      throw new HttpValidationError(
        400,
        'invalid_state',
        'O objeto "state" serializado deve ter entre 2 e 200.000 caracteres.',
      );
    }
    validatedState = rawState;
  } else {
    throw new HttpValidationError(
      400,
      'invalid_state',
      'Campo "state" obrigatório: informe texto não vazio ou objeto JSON.',
    );
  }

  const rawQuestions = rawBody.questions;
  if (!isPlainObject(rawQuestions)) {
    throw new HttpValidationError(
      400,
      'invalid_questions',
      'O campo "questions" deve ser um objeto com 1 a 128 perguntas.',
    );
  }

  const questionKeys = Object.keys(rawQuestions);
  if (questionKeys.length < 1 || questionKeys.length > 128) {
    throw new HttpValidationError(
      400,
      'invalid_questions',
      'Informe entre 1 e 128 perguntas em "questions".',
    );
  }

  const sanitizedQuestions: Record<string, SubqQuestion> = {};

  for (const qKey of questionKeys) {
    if (!isSafeKey(qKey)) {
      throw new HttpValidationError(
        400,
        'invalid_questions',
        `Chave de pergunta inválida: "${qKey}".`,
      );
    }

    const q = rawQuestions[qKey];
    if (!isPlainObject(q)) {
      throw new HttpValidationError(
        400,
        'invalid_questions',
        `A pergunta "${qKey}" deve ser um objeto.`,
      );
    }

    if (
      typeof q.instructions !== 'string' ||
      q.instructions.trim().length < 1 ||
      q.instructions.length > 4000
    ) {
      throw new HttpValidationError(
        400,
        'invalid_questions',
        `O campo "instructions" da pergunta "${qKey}" deve ter entre 1 e 4.000 caracteres.`,
      );
    }

    if (q.type === 'choice') {
      if (!isPlainObject(q.criteria)) {
        throw new HttpValidationError(
          400,
          'invalid_questions',
          `A pergunta choice "${qKey}" requer um objeto "criteria".`,
        );
      }
      const cKeys = Object.keys(q.criteria);
      if (cKeys.length < 2 || cKeys.length > 255) {
        throw new HttpValidationError(
          400,
          'invalid_questions',
          `A pergunta choice "${qKey}" deve conter entre 2 e 255 opções em "criteria".`,
        );
      }
      const sanitizedCriteria: Record<string, string | null> = {};
      for (const cKey of cKeys) {
        if (!isSafeKey(cKey)) {
          throw new HttpValidationError(
            400,
            'invalid_questions',
            `Chave de critério inválida "${cKey}" em "${qKey}".`,
          );
        }
        const cVal = q.criteria[cKey];
        if (cVal !== null && (typeof cVal !== 'string' || cVal.length > 1000)) {
          throw new HttpValidationError(
            400,
            'invalid_questions',
            `Descrição da opção "${cKey}" em "${qKey}" deve ser string (<=1000 chars) ou null.`,
          );
        }
        sanitizedCriteria[cKey] = cVal;
      }
      sanitizedQuestions[qKey] = {
        type: 'choice',
        instructions: q.instructions,
        criteria: sanitizedCriteria,
      };
    } else if (q.type === 'score') {
      if (
        !Array.isArray(q.criteria) ||
        q.criteria.length < 2 ||
        q.criteria.length > 10
      ) {
        throw new HttpValidationError(
          400,
          'invalid_questions',
          `A pergunta score "${qKey}" deve conter um array "criteria" com 2 a 10 níveis.`,
        );
      }
      const levels: string[] = [];
      for (const level of q.criteria) {
        if (
          typeof level !== 'string' ||
          level.trim().length < 1 ||
          level.length > 500
        ) {
          throw new HttpValidationError(
            400,
            'invalid_questions',
            `Cada nível de "criteria" na pergunta score "${qKey}" deve ter entre 1 e 500 caracteres.`,
          );
        }
        levels.push(level);
      }
      sanitizedQuestions[qKey] = {
        type: 'score',
        instructions: q.instructions,
        criteria: levels,
      };
    } else if (q.type === 'noul') {
      let sanitizedCriteria: { true?: string; false?: string } | undefined;
      if (q.criteria !== undefined) {
        if (!isPlainObject(q.criteria)) {
          throw new HttpValidationError(
            400,
            'invalid_questions',
            `O campo "criteria" da pergunta noul "${qKey}" deve ser um objeto.`,
          );
        }
        for (const cKey of Object.keys(q.criteria)) {
          if (FORBIDDEN_KEYS.has(cKey) || (cKey !== 'true' && cKey !== 'false')) {
            throw new HttpValidationError(
              400,
              'invalid_questions',
              `Chave inválida "${cKey}" em criteria de "${qKey}" (apenas "true" e "false" são aceitos).`,
            );
          }
        }
        const tVal = q.criteria.true;
        const fVal = q.criteria.false;
        if (tVal !== undefined && (typeof tVal !== 'string' || tVal.length > 1000)) {
          throw new HttpValidationError(
            400,
            'invalid_questions',
            `O critério "true" da pergunta noul "${qKey}" deve ser string de até 1.000 caracteres.`,
          );
        }
        if (fVal !== undefined && (typeof fVal !== 'string' || fVal.length > 1000)) {
          throw new HttpValidationError(
            400,
            'invalid_questions',
            `O critério "false" da pergunta noul "${qKey}" deve ser string de até 1.000 caracteres.`,
          );
        }
        sanitizedCriteria = {};
        if (tVal !== undefined) sanitizedCriteria.true = tVal;
        if (fVal !== undefined) sanitizedCriteria.false = fVal;
      }

      sanitizedQuestions[qKey] = sanitizedCriteria
        ? {
            type: 'noul',
            instructions: q.instructions,
            criteria: sanitizedCriteria,
          }
        : {
            type: 'noul',
            instructions: q.instructions,
          };
    } else {
      throw new HttpValidationError(
        400,
        'invalid_questions',
        `Tipo de pergunta não suportado em "${qKey}". Use "choice", "score" ou "noul".`,
      );
    }
  }

  return { state: validatedState, questions: sanitizedQuestions };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function sanitizeProbabilitiesRecord(raw: unknown): Record<string, number> {
  if (!isPlainObject(raw)) return {};
  const result: Record<string, number> = {};
  for (const key of Object.keys(raw)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    const val = raw[key];
    if (typeof val === 'number' && Number.isFinite(val)) {
      result[key] = clamp01(val);
    }
  }
  return result;
}

function sanitizeUpstreamAnswers(
  rawJson: unknown,
  questions: Record<string, SubqQuestion>,
): {
  answers: Record<string, SubqAnswer>;
  usage: { input_tokens: number; output_tokens: number };
} {
  if (!isPlainObject(rawJson) || !isPlainObject(rawJson.answers)) {
    throw new HttpValidationError(
      502,
      'invalid_upstream_response',
      'Resposta inválida da API SubQ: campo "answers" ausente.',
      502,
    );
  }

  const rawAnswers = rawJson.answers;
  const sanitizedAnswers: Record<string, SubqAnswer> = {};

  for (const [qKey, qDef] of Object.entries(questions)) {
    const rawAns = rawAnswers[qKey];
    if (!isPlainObject(rawAns)) {
      throw new HttpValidationError(
        502,
        'invalid_upstream_response',
        `Resposta da API SubQ não incluiu a pergunta "${qKey}".`,
        502,
      );
    }

    if (qDef.type === 'choice') {
      const probabilities = sanitizeProbabilitiesRecord(rawAns.probabilities);
      for (const cKey of Object.keys(qDef.criteria)) {
        if (!(cKey in probabilities)) {
          probabilities[cKey] = 0;
        }
      }
      const entries = Object.entries(probabilities);
      const topEntry = entries.reduce<[string, number]>(
        (best, curr) => (curr[1] > best[1] ? curr : best),
        entries[0] ?? ['', 0],
      );
      const choice =
        typeof rawAns.choice === 'string' && rawAns.choice.length > 0
          ? rawAns.choice
          : topEntry[0];
      const confidence =
        typeof rawAns.confidence === 'number' && Number.isFinite(rawAns.confidence)
          ? clamp01(rawAns.confidence)
          : clamp01(topEntry[1]);

      const cleanChoice: SubqChoiceAnswer = {
        type: 'choice',
        choice,
        probabilities,
        confidence,
      };
      sanitizedAnswers[qKey] = cleanChoice;
    } else if (qDef.type === 'score') {
      const probabilities = sanitizeProbabilitiesRecord(rawAns.probabilities);
      const legend: Record<string, string> = {};
      if (isPlainObject(rawAns.legend)) {
        for (const key of Object.keys(rawAns.legend)) {
          if (FORBIDDEN_KEYS.has(key)) continue;
          const label = rawAns.legend[key];
          if (typeof label === 'string') {
            legend[key] = label;
          }
        }
      }
      qDef.criteria.forEach((label, idx) => {
        const key = String(idx);
        if (!(key in legend)) legend[key] = label;
        if (!(key in probabilities)) probabilities[key] = 0;
      });

      const probEntries = Object.entries(probabilities);
      const maxProb = probEntries.reduce((m, [, p]) => Math.max(m, p), 0);
      const fallbackScore = probEntries.reduce(
        (acc, [idxStr, p]) => acc + (Number.isFinite(Number(idxStr)) ? Number(idxStr) * p : 0),
        0,
      );
      const score =
        typeof rawAns.score === 'number' && Number.isFinite(rawAns.score)
          ? rawAns.score
          : fallbackScore;
      const confidence =
        typeof rawAns.confidence === 'number' && Number.isFinite(rawAns.confidence)
          ? clamp01(rawAns.confidence)
          : clamp01(maxProb);

      const cleanScore: SubqScoreAnswer = {
        type: 'score',
        score,
        legend,
        probabilities,
        confidence,
      };
      sanitizedAnswers[qKey] = cleanScore;
    } else {
      const rawNoul = rawAns.noul;
      if (typeof rawNoul !== 'number' || !Number.isFinite(rawNoul)) {
        throw new HttpValidationError(
          502,
          'invalid_upstream_response',
          `Resposta noul inválida para "${qKey}".`,
          502,
        );
      }
      const cleanNoul: SubqNoulAnswer = {
        type: 'noul',
        noul: clamp01(rawNoul),
      };
      sanitizedAnswers[qKey] = cleanNoul;
    }
  }

  const rawUsage = isPlainObject(rawJson.usage) ? rawJson.usage : undefined;
  const inputTokens =
    rawUsage &&
    typeof rawUsage.input_tokens === 'number' &&
    Number.isFinite(rawUsage.input_tokens)
      ? Math.max(0, Math.round(rawUsage.input_tokens))
      : 0;

  return {
    answers: sanitizedAnswers,
    usage: {
      input_tokens: inputTokens,
      output_tokens: 0,
    },
  };
}

function sanitizeErrorDetail(rawText: string, apiKey: string): string {
  let detail = rawText.trim();
  if (!detail) return '';
  try {
    const parsed = JSON.parse(detail) as unknown;
    if (isPlainObject(parsed)) {
      if (typeof parsed.error === 'string') {
        detail = parsed.error;
      } else if (isPlainObject(parsed.error) && typeof parsed.error.message === 'string') {
        detail = parsed.error.message;
      } else if (typeof parsed.message === 'string') {
        detail = parsed.message;
      } else if (typeof parsed.detail === 'string') {
        detail = parsed.detail;
      }
    }
  } catch {
    // keep plain text detail
  }

  if (apiKey) {
    detail = detail.split(apiKey).join('[REDACTED]');
  }
  detail = detail.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
  return detail.slice(0, 400);
}

function mapUpstreamError(
  status: number,
  rawText: string,
  apiKey: string,
): {
  status: number;
  body: { error: string; code: string; upstreamStatus: number };
} {
  const detail = sanitizeErrorDetail(rawText, apiKey);

  switch (status) {
    case 400:
      return {
        status: 400,
        body: {
          error: detail || 'Requisição rejeitada pela API SubQ.',
          code: 'upstream_bad_request',
          upstreamStatus: 400,
        },
      };
    case 401:
      return {
        status: 401,
        body: {
          error: 'Chave da API SubQ inválida ou não autorizada.',
          code: 'upstream_unauthorized',
          upstreamStatus: 401,
        },
      };
    case 402:
      return {
        status: 402,
        body: {
          error: 'Créditos insuficientes na conta SubQ para executar subq-snap-1.2.',
          code: 'upstream_payment_required',
          upstreamStatus: 402,
        },
      };
    case 403:
      return {
        status: 403,
        body: {
          error: 'Acesso negado pela API SubQ para esta chave.',
          code: 'upstream_forbidden',
          upstreamStatus: 403,
        },
      };
    case 422:
      return {
        status: 422,
        body: {
          error: detail || 'Estrutura de perguntas rejeitada pelo modelo subq-snap-1.2.',
          code: 'upstream_unprocessable',
          upstreamStatus: 422,
        },
      };
    case 429:
      return {
        status: 429,
        body: {
          error: 'Limite de taxa da API SubQ atingido. Aguarde e tente novamente.',
          code: 'upstream_rate_limited',
          upstreamStatus: 429,
        },
      };
    default:
      if (status >= 500) {
        return {
          status: 502,
          body: {
            error: 'Serviço SubQ temporariamente indisponível. Tente novamente em instantes.',
            code: 'upstream_server_error',
            upstreamStatus: status,
          },
        };
      }
      return {
        status: 502,
        body: {
          error: detail || `Erro inesperado da API SubQ (HTTP ${status}).`,
          code: 'upstream_error',
          upstreamStatus: status,
        },
      };
  }
}

export function createSnapMiddleware(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void {
  const upstreamUrl = resolveUpstreamUrl(env);
  let inFlight = 0;

  async function handleDecide(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if ((req.method ?? 'GET').toUpperCase() !== 'POST') {
      sendJson(
        res,
        405,
        { error: 'Método não permitido. Use POST em /api/decide.', code: 'method_not_allowed' },
        { Allow: 'POST' },
      );
      return;
    }

    try {
      validateRequestOriginAndHeaders(req);
    } catch (err) {
      drainRequestStream(req, res);
      if (err instanceof HttpValidationError) {
        const body =
          err.upstreamStatus !== undefined
            ? { error: err.message, code: err.code, upstreamStatus: err.upstreamStatus }
            : { error: err.message, code: err.code };
        sendJson(res, err.status, body);
        return;
      }
      throw err;
    }

    if (inFlight >= MAX_IN_FLIGHT) {
      drainRequestStream(req, res);
      sendJson(res, 429, {
        error: 'Muitas requisições simultâneas em andamento (máximo 6).',
        code: 'too_many_requests',
      });
      return;
    }

    inFlight += 1;
    try {
      const headerKey = getHeaderString(req.headers, 'x-subq-api-key')?.trim() ?? '';
      const serverKey = env.SUBQ_API_KEY?.trim() ?? '';
      const apiKey = headerKey || serverKey;

      if (!apiKey) {
        drainRequestStream(req, res);
        sendJson(res, 401, {
          error: 'Informe sua chave da API SubQ para consultar o modelo subq-snap-1.2.',
          code: 'missing_api_key',
        });
        return;
      }

      const rawBody = await readJsonBody(req, res);
      const { state, questions } = validateDecidePayload(rawBody);

      const startedAt = Date.now();
      let upstreamRes: globalThis.Response;
      try {
        upstreamRes = await fetchImpl(upstreamUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: MODEL,
            state,
            questions,
          }),
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        });
      } catch (err) {
        const isTimeout =
          err instanceof Error &&
          (err.name === 'TimeoutError' || err.name === 'AbortError');
        sendJson(res, isTimeout ? 504 : 502, {
          error: isTimeout
            ? 'Tempo limite de 60s excedido ao consultar o modelo subq-snap-1.2.'
            : 'Falha de conexão com a API SubQ.',
          code: isTimeout ? 'upstream_timeout' : 'upstream_network_error',
          upstreamStatus: isTimeout ? 504 : 502,
        });
        return;
      }

      const rawUpstreamText = await upstreamRes.text();

      if (!upstreamRes.ok) {
        const mapped = mapUpstreamError(upstreamRes.status, rawUpstreamText, apiKey);
        sendJson(res, mapped.status, mapped.body);
        return;
      }

      let upstreamJson: unknown;
      try {
        upstreamJson = JSON.parse(rawUpstreamText) as unknown;
      } catch {
        sendJson(res, 502, {
          error: 'A API SubQ retornou um JSON inválido.',
          code: 'invalid_upstream_response',
          upstreamStatus: 502,
        });
        return;
      }

      const { answers, usage } = sanitizeUpstreamAnswers(upstreamJson, questions);
      const latency_ms = Math.max(0, Math.round(Date.now() - startedAt));

      const responseBody: DecideResponse = {
        model: MODEL,
        answers,
        usage,
        latency_ms,
      };
      sendJson(res, 200, responseBody);
    } catch (err) {
      if (err instanceof HttpValidationError) {
        const body =
          err.upstreamStatus !== undefined
            ? { error: err.message, code: err.code, upstreamStatus: err.upstreamStatus }
            : { error: err.message, code: err.code };
        sendJson(res, err.status, body);
        return;
      }
      sendJson(res, 500, {
        error: 'Erro interno ao processar a solicitação para subq-snap-1.2.',
        code: 'internal_error',
      });
    } finally {
      inFlight = Math.max(0, inFlight - 1);
    }
  }

  return (req, res, next) => {
    let pathname = '/';
    try {
      pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    } catch {
      next();
      return;
    }

    if (pathname === '/api/health') {
      if ((req.method ?? 'GET').toUpperCase() !== 'GET') {
        sendJson(
          res,
          405,
          { error: 'Método não permitido. Use GET em /api/health.', code: 'method_not_allowed' },
          { Allow: 'GET' },
        );
        return;
      }
      const health: HealthResponse = {
        ok: true,
        model: MODEL,
        hasServerKey: Boolean(env.SUBQ_API_KEY?.trim()),
      };
      sendJson(res, 200, health);
      return;
    }

    if (pathname === '/api/decide') {
      void handleDecide(req, res).catch((err) => {
        if (!res.writableEnded) {
          sendJson(res, 500, {
            error: 'Erro inesperado no proxy SubQ.',
            code: 'internal_error',
          });
        } else {
          next(err);
        }
      });
      return;
    }

    next();
  };
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SubqQuestion } from '../types/subq';
import {
  SubqApiError,
  decideWithSubq,
  fetchHealth,
  parseDecideResponse,
  parseHealthResponse,
} from './snap';

const questions: Record<string, SubqQuestion> = {
  fit: { type: 'choice', instructions: 'Fit?', criteria: { yes: null, no: null } },
  level: { type: 'score', instructions: 'Level?', criteria: ['low', 'high'] },
  gap: { type: 'noul', instructions: 'Gap?' },
};

const validBody = {
  model: 'subq-snap-1.2',
  answers: {
    fit: { type: 'choice', choice: 'yes', probabilities: { yes: 0.8, no: 0.2 }, confidence: 0.8 },
    level: {
      type: 'score',
      score: 0.7,
      legend: { '0': 'low', '1': 'high' },
      probabilities: { '0': 0.3, '1': 0.7 },
      confidence: 0.7,
    },
    gap: { type: 'noul', noul: 0.1 },
  },
  usage: { input_tokens: 12, output_tokens: 0 },
  latency_ms: 40,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseDecideResponse', () => {
  it('accepts a response that matches every question', () => {
    expect(parseDecideResponse(validBody, questions)?.answers.fit).toEqual(validBody.answers.fit);
  });

  it.each([
    ['missing answers object', { ...validBody, answers: null }],
    ['missing question', { ...validBody, answers: { fit: validBody.answers.fit } }],
    [
      'wrong answer type',
      { ...validBody, answers: { ...validBody.answers, gap: { type: 'choice', choice: 'x' } } },
    ],
    [
      'non-numeric probability',
      {
        ...validBody,
        answers: {
          ...validBody.answers,
          fit: { ...validBody.answers.fit, probabilities: { yes: 'high' } },
        },
      },
    ],
    ['noul not a number', { ...validBody, answers: { ...validBody.answers, gap: { type: 'noul' } } }],
  ])('rejects %s', (_label, body) => {
    expect(parseDecideResponse(body, questions)).toBeNull();
  });
});

describe('decideWithSubq', () => {
  it('throws a SubqApiError when a 200 response has an unexpected shape', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ answers: {} })));
    await expect(decideWithSubq({ state: 'cv', questions })).rejects.toMatchObject({
      name: 'SubqApiError',
      code: 'invalid_response_shape',
    });
  });

  it('returns the validated response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(validBody)));
    const result = await decideWithSubq({ state: 'cv', questions });
    expect(result.answers.gap).toEqual({ type: 'noul', noul: 0.1 });
    expect(result.usage.input_tokens).toBe(12);
  });
});

describe('health', () => {
  it('parses deployment and defaults it to local', () => {
    expect(parseHealthResponse({ ok: true, hasServerKey: false, deployment: 'hosted' })).toEqual({
      ok: true,
      model: 'subq-snap-1.2',
      hasServerKey: false,
      deployment: 'hosted',
    });
    expect(parseHealthResponse({ ok: true, hasServerKey: true })?.deployment).toBe('local');
    expect(parseHealthResponse({ ok: 'yes' })).toBeNull();
  });

  it('rejects a static host that answers /api/health with HTML', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<!doctype html>', { status: 200 })),
    );
    await expect(fetchHealth()).rejects.toBeInstanceOf(SubqApiError);
  });
});

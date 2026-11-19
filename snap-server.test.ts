import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSnapMiddleware, resolveUpstreamUrl } from './snap-server';

interface TestServer {
  baseUrl: string;
  port: number;
  close: () => Promise<void>;
}

const activeServers: TestServer[] = [];

async function startMiddlewareServer(
  env: Record<string, string | undefined> = {},
  fetchImpl?: typeof fetch,
): Promise<TestServer> {
  const middleware = createSnapMiddleware(env, fetchImpl);
  const server = http.createServer((req, res) => {
    middleware(req, res, (err) => {
      if (err) {
        res.statusCode = 500;
        res.end('Middleware error');
        return;
      }
      res.statusCode = 404;
      res.end('Not found');
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address() as AddressInfo;
  const handle: TestServer = {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    port: addr.port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
  activeServers.push(handle);
  return handle;
}

function rawHttpRequest(options: {
  port: number;
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<{ status: number; headers: http.IncomingHttpHeaders; text: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: options.port,
        method: options.method,
        path: options.path,
        headers: options.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            text: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    if (options.body !== undefined) {
      req.write(options.body);
    }
    req.end();
  });
}

afterEach(async () => {
  while (activeServers.length > 0) {
    const srv = activeServers.pop();
    if (srv) {
      await srv.close();
    }
  }
});

const VALID_PAYLOAD = {
  state: 'Candidato com 6 anos de experiência em Go, PostgreSQL e sistemas distribuídos.',
  questions: {
    fit_nivel: {
      type: 'choice' as const,
      instructions: 'Qual o nível de aderência geral?',
      criteria: {
        alto: 'Atende com sobra aos requisitos críticos',
        medio: 'Atende parcialmente com lacunas pontuais',
      },
    },
    arquitetura: {
      type: 'score' as const,
      instructions: 'Avalie a profundidade em arquitetura distribuída.',
      criteria: ['Insuficiente', 'Parcial', 'Atende', 'Excepcional'],
    },
    evidencia_suficiente: {
      type: 'noul' as const,
      instructions: 'Há evidência concreta suficiente para avaliar sem especular?',
      criteria: {
        true: 'Evidência direta e verificável',
        false: 'Faltam dados concretos',
      },
    },
  },
};

describe('snap-server middleware', () => {
  it('GET /api/health reports model subq-snap-1.2 and hasServerKey status', async () => {
    const withoutKey = await startMiddlewareServer({});
    const res1 = await fetch(`${withoutKey.baseUrl}/api/health`);
    expect(res1.status).toBe(200);
    expect(await res1.json()).toEqual({
      ok: true,
      model: 'subq-snap-1.2',
      hasServerKey: false,
    });

    const withKey = await startMiddlewareServer({ SUBQ_API_KEY: '  sk-server-test  ' });
    const res2 = await fetch(`${withKey.baseUrl}/api/health`);
    expect(res2.status).toBe(200);
    expect(await res2.json()).toEqual({
      ok: true,
      model: 'subq-snap-1.2',
      hasServerKey: true,
    });
  });

  it('validates SUBQ_API_URL to require https://*.subq.ai', () => {
    expect(resolveUpstreamUrl({})).toBe('https://api.subq.ai/v1/systemone');
    expect(resolveUpstreamUrl({ SUBQ_API_URL: 'https://staging.subq.ai/v1/systemone' })).toBe(
      'https://staging.subq.ai/v1/systemone',
    );
    expect(() => resolveUpstreamUrl({ SUBQ_API_URL: 'http://api.subq.ai/v1/systemone' })).toThrow();
    expect(() => resolveUpstreamUrl({ SUBQ_API_URL: 'https://evil.com/v1/systemone' })).toThrow();
  });

  it('returns 401 when neither header nor env API key is provided', async () => {
    const mockFetch = vi.fn<typeof fetch>();
    const srv = await startMiddlewareServer({}, mockFetch);

    const res = await fetch(`${srv.baseUrl}/api/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_PAYLOAD),
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string; code: string };
    expect(body).toEqual({
      error: 'Informe sua chave da API SubQ para consultar o modelo subq-snap-1.2.',
      code: 'missing_api_key',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('blocks non-localhost Host, cross-site Origin, and Sec-Fetch-Site headers', async () => {
    const srv = await startMiddlewareServer({ SUBQ_API_KEY: 'sk-test-key' });

    const badHost = await rawHttpRequest({
      port: srv.port,
      method: 'POST',
      path: '/api/decide',
      headers: {
        Host: 'attacker.example:5173',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(VALID_PAYLOAD),
    });
    expect(badHost.status).toBe(403);

    const badOrigin = await rawHttpRequest({
      port: srv.port,
      method: 'POST',
      path: '/api/decide',
      headers: {
        Host: `127.0.0.1:${srv.port}`,
        Origin: 'https://attacker.example',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(VALID_PAYLOAD),
    });
    expect(badOrigin.status).toBe(403);

    const badFetchSite = await rawHttpRequest({
      port: srv.port,
      method: 'POST',
      path: '/api/decide',
      headers: {
        Host: `localhost:${srv.port}`,
        'Sec-Fetch-Site': 'cross-site',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(VALID_PAYLOAD),
    });
    expect(badFetchSite.status).toBe(403);
  });

  it('returns 400 on invalid payloads (empty state, invalid questions, prototype keys)', async () => {
    const mockFetch = vi.fn<typeof fetch>();
    const srv = await startMiddlewareServer({ SUBQ_API_KEY: 'sk-server-123' }, mockFetch);

    const badCases: Array<unknown> = [
      { state: '   ', questions: VALID_PAYLOAD.questions },
      { state: 'ok', questions: {} },
      {
        state: 'ok',
        questions: {
          q1: { type: 'choice', instructions: 'x', criteria: { unica: null } },
        },
      },
      {
        state: 'ok',
        questions: {
          q1: { type: 'score', instructions: 'x', criteria: ['Unico'] },
        },
      },
      {
        state: 'ok',
        questions: {
          q1: {
            type: 'noul',
            instructions: 'x',
            criteria: { true: 'sim', invalid: 'nope' },
          },
        },
      },
    ];

    for (const payload of badCases) {
      const res = await fetch(`${srv.baseUrl}/api/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(400);
    }

    // Explicitly send JSON string containing "__proto__" as an own key
    const protoRes = await fetch(`${srv.baseUrl}/api/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"state":"ok","questions":{"__proto__":{"type":"noul","instructions":"check"}}}',
    });
    expect(protoRes.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns 413 when payload exceeds 1 MB (both Content-Length and chunked stream)', async () => {
    const srv = await startMiddlewareServer({ SUBQ_API_KEY: 'sk-server-123' });
    const hugeBody = JSON.stringify({
      state: 'a'.repeat(1024 * 1024 + 100),
      questions: VALID_PAYLOAD.questions,
    });

    for (let i = 0; i < 5; i += 1) {
      const res = await fetch(`${srv.baseUrl}/api/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: hugeBody,
      });

      expect(res.status).toBe(413);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe('payload_too_large');
    }

    // Also verify chunked streaming upload (no Content-Length header)
    const streamBody = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        const chunk = encoder.encode('a'.repeat(256 * 1024));
        controller.enqueue(encoder.encode('{"state":"'));
        for (let i = 0; i < 5; i += 1) {
          controller.enqueue(chunk);
        }
        controller.enqueue(encoder.encode('","questions":{}}'));
        controller.close();
      },
    });

    const streamRes = await fetch(`${srv.baseUrl}/api/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: streamBody,
      duplex: 'half',
    } as RequestInit);
    expect(streamRes.status).toBe(413);
  });

  it('enforces MAX_IN_FLIGHT = 6 concurrency guard with 429', async () => {
    let releaseAll!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseAll = resolve;
    });

    const mockFetch = vi.fn<typeof fetch>(async () => {
      await gate;
      return new Response(
        JSON.stringify({
          answers: {
            q1: { type: 'noul', noul: 0.7 },
          },
          usage: { input_tokens: 10 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const srv = await startMiddlewareServer({ SUBQ_API_KEY: 'sk-server-123' }, mockFetch);
    const simplePayload = JSON.stringify({
      state: 'texto',
      questions: { q1: { type: 'noul', instructions: 'há evidência?' } },
    });

    const inFlightPromises = Array.from({ length: 6 }, () =>
      fetch(`${srv.baseUrl}/api/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: simplePayload,
      }),
    );

    // Wait briefly so all 6 requests enter fetchImpl
    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(6);
    });

    const seventhRes = await fetch(`${srv.baseUrl}/api/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: simplePayload,
    });
    expect(seventhRes.status).toBe(429);

    releaseAll();
    const responses = await Promise.all(inFlightPromises);
    for (const r of responses) {
      expect(r.status).toBe(200);
    }
  });

  it('forwards model subq-snap-1.2 + Bearer key and sanitizes choice/score/noul without leaking key', async () => {
    const secretKey = 'sk_live_never_leak_987654';
    const mockFetch = vi.fn<typeof fetch>(async (url, init) => {
      expect(url).toBe('https://api.subq.ai/v1/systemone');
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${secretKey}`);
      expect(headers['Content-Type']).toBe('application/json');

      const forwarded = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(forwarded.model).toBe('subq-snap-1.2');
      expect(forwarded.state).toBe(VALID_PAYLOAD.state);

      const rawResponse = JSON.stringify({
        model: 'subq-snap-1.2',
        answers: {
          fit_nivel: {
            type: 'choice',
            choice: 'alto',
            probabilities: { alto: 0.82, medio: 0.18 },
            confidence: 1.4, // should clamp to 1
          },
          arquitetura: {
            type: 'score',
            score: 2.35,
            legend: {
              '0': 'Insuficiente',
              '1': 'Parcial',
              '2': 'Atende',
              '3': 'Excepcional',
            },
            probabilities: { '0': 0.02, '1': 0.13, '2': 0.55, '3': 0.3 },
            confidence: 0.88,
          },
          evidencia_suficiente: {
            type: 'noul',
            noul: 0.76,
          },
        },
        usage: {
          input_tokens: 412,
          output_tokens: 99, // output_tokens normalized to 0
        },
      }).replace(
        '"medio":0.18',
        '"medio":0.18,"__proto__":0.5,"constructor":0.2',
      );

      return new Response(rawResponse, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const srv = await startMiddlewareServer({}, mockFetch);

    // Attempt to pass an unauthorized model override from client — proxy must ignore it
    const res = await fetch(`${srv.baseUrl}/api/decide`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SubQ-Api-Key': `  ${secretKey}  `,
      },
      body: JSON.stringify({ ...VALID_PAYLOAD, model: 'other-model' }),
    });

    expect(res.status).toBe(200);
    const rawText = await res.text();
    expect(rawText).not.toContain(secretKey);
    expect(JSON.stringify(Object.fromEntries(res.headers.entries()))).not.toContain(secretKey);

    const parsed = JSON.parse(rawText) as {
      model: string;
      answers: {
        fit_nivel: { type: string; choice: string; probabilities: Record<string, number>; confidence: number };
        arquitetura: { type: string; score: number; legend: Record<string, string>; probabilities: Record<string, number>; confidence: number };
        evidencia_suficiente: { type: string; noul: number };
      };
      usage: { input_tokens: number; output_tokens: number };
      latency_ms: number;
    };

    expect(parsed.model).toBe('subq-snap-1.2');
    expect(parsed.answers.fit_nivel).toEqual({
      type: 'choice',
      choice: 'alto',
      probabilities: { alto: 0.82, medio: 0.18 },
      confidence: 1,
    });
    expect(parsed.answers.arquitetura).toEqual({
      type: 'score',
      score: 2.35,
      legend: {
        '0': 'Insuficiente',
        '1': 'Parcial',
        '2': 'Atende',
        '3': 'Excepcional',
      },
      probabilities: { '0': 0.02, '1': 0.13, '2': 0.55, '3': 0.3 },
      confidence: 0.88,
    });
    expect(parsed.answers.evidencia_suficiente).toEqual({
      type: 'noul',
      noul: 0.76,
    });
    expect(parsed.usage).toEqual({ input_tokens: 412, output_tokens: 0 });
    expect(parsed.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('maps upstream error responses cleanly without leaking the API key', async () => {
    const secretKey = 'sk_secret_should_never_echo';
    const mockFetch = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          error: `Bad request with Bearer ${secretKey} and ${secretKey}`,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const srv = await startMiddlewareServer({}, mockFetch);
    const res = await fetch(`${srv.baseUrl}/api/decide`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SubQ-Api-Key': secretKey,
      },
      body: JSON.stringify(VALID_PAYLOAD),
    });

    expect(res.status).toBe(400);
    const raw = await res.text();
    expect(raw).not.toContain(secretKey);
    const parsed = JSON.parse(raw) as { error: string; code: string; upstreamStatus: number };
    expect(parsed.code).toBe('upstream_bad_request');
    expect(parsed.upstreamStatus).toBe(400);
  });
});

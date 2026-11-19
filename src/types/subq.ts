export type SubqQuestionType = 'choice' | 'score' | 'noul';

export interface SubqChoiceQuestion {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string | null>;
}

export interface SubqScoreQuestion {
  type: 'score';
  instructions: string;
  criteria: string[];
}

export interface SubqNoulQuestion {
  type: 'noul';
  instructions: string;
  criteria?: {
    true?: string;
    false?: string;
  };
}

export type SubqQuestion =
  | SubqChoiceQuestion
  | SubqScoreQuestion
  | SubqNoulQuestion;

export interface SubqChoiceAnswer {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface SubqScoreAnswer {
  type: 'score';
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface SubqNoulAnswer {
  type: 'noul';
  noul: number;
}

export type SubqAnswer =
  | SubqChoiceAnswer
  | SubqScoreAnswer
  | SubqNoulAnswer;

export interface DecideRequest {
  state: string | Record<string, unknown>;
  questions: Record<string, SubqQuestion>;
}

export interface DecideResponse {
  model: 'subq-snap-1.2';
  answers: Record<string, SubqAnswer>;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  latency_ms: number;
}

export interface HealthResponse {
  ok: boolean;
  model: 'subq-snap-1.2';
  hasServerKey: boolean;
  /** `local`: Vite dev/preview proxy. `hosted`: serverless function (for example Vercel). */
  deployment: 'local' | 'hosted';
}

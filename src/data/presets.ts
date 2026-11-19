import { slugifyKey } from '../lib/format';
import type { ConsensusInput } from '../stochastic/consensus';
import type { SubqQuestion, SubqQuestionType } from '../types/subq';

export interface StochasticCandidate {
  id: string;
  name: string;
  summary: string;
  dossier: string;
}

export interface StochasticCriterion {
  id: string;
  label: string;
  description: string;
  weight: number;
}

export interface StochasticEvaluator {
  id: string;
  name: string;
  role: string;
  focusPrompt: string;
}

export interface StochasticPreset {
  id: string;
  title: string;
  subtitle: string;
  vagaTexto: string;
  candidates: StochasticCandidate[];
  criteria: StochasticCriterion[];
  grades: string[];
  gradeUtilities: number[];
  evaluators: StochasticEvaluator[];
}

export const DEFAULT_RUBRIC_GRADES = [
  'Insuficiente',
  'Parcial',
  'Atende',
  'Excepcional',
] as const;

export const DEFAULT_GRADE_UTILITIES = [0, 1 / 3, 2 / 3, 1] as const;

export const STOCHASTIC_PRESETS: StochasticPreset[] = [
  {
    id: 'backend-senior',
    title: 'Engenharia Backend Sênior',
    subtitle: 'Sistemas distribuídos, bancos de dados, confiabilidade (SRE) e mentoria técnica.',
    vagaTexto: `Vaga: Pessoa Engenheira de Software Backend Sênior (Plataforma & Pagamentos)

Contexto da posição:
Buscamos profissional sênior para atuar na evolução dos serviços centrais de liquidação e processamento assíncrono (~12 mil req/min no pico), com alta exigência de consistência transacional, baixa latência e operação contínua em produção.

Requisitos e expectativas:
1. Arquitetura Distribuída & APIs: domínio comprovado no desenho de serviços resilientes (Go, TypeScript/Node.js ou Java), idempotência, mensageria, controle de concorrência e contratos de APIs versionados.
2. Banco de Dados & Performance: experiência prática em modelagem relacional (PostgreSQL), otimização de índices/planos de execução, locks, isolamento transacional e cache distribuído (Redis).
3. Observabilidade & Confiabilidade (SRE): vivência em instrumentação (OpenTelemetry, Prometheus, tracing distribuído), definição de SLOs, resposta a incidentes e testes de carga/falha.
4. Colaboração Técnica & Mentoria: capacidade de conduzir revisões de arquitetura (RFCs), orientar pessoas engenheiras de nível pleno/júnior e alinhar riscos técnicos com produto.`,
    candidates: [
      {
        id: 'cand-marina',
        name: 'Marina Vasconcelos',
        summary: 'Perfil aderente com evidências de produção em alta escala',
        dossier: `Dossiê — Marina Vasconcelos (7 anos em Engenharia Backend)

Experiência verificada:
- Nos últimos 4 anos atuou como Backend Sênior em plataforma de pagamentos (Go e PostgreSQL), redesenhando o fluxo de liquidação com chaves de idempotência e outbox pattern; reduziu duplicidades a zero e manteve latência p99 abaixo de 85 ms sob 15 mil req/min.
- Conduziu diagnóstico e migração de índices parciais e particionamento mensal no PostgreSQL (tabelas > 400 GB), eliminando contenção de locks em janelas de fechamento e reduzindo CPU do primário em 42%.
- Implementou tracing distribuído com OpenTelemetry + Grafana Tempo, definiu SLOs de disponibilidade (99,95%) com error budgets e liderou post-mortems sem culpabilização.
- Notas da entrevista técnica: explicou com clareza trade-offs entre consistência eventual e saga orquestrada; escreveu 9 RFCs aprovadas e mentorou 3 devs plenos promovidos no último ciclo.`,
      },
      {
        id: 'cand-rafael',
        name: 'Rafael Monteiro',
        summary: 'Perfil misto com lacunas explícitas de evidência em SRE e escala',
        dossier: `Dossiê — Rafael Monteiro (5 anos em Desenvolvimento Backend)

Experiência e notas da entrevista:
- Trabalhou nos últimos 3 anos construindo APIs REST em Node.js/TypeScript e PostgreSQL para sistema B2B de gestão logística (tráfego moderado, cerca de 300 req/min).
- Demonstrou bom domínio de modelagem SQL, migrations e criação de índices compostos simples durante o estudo de caso em aula técnica.
- Lacunas explícitas no dossiê: nunca operou serviços com mensageria assíncrona em alto volume nem implementou padrões de idempotência sob falhas parciais.
- Observabilidade & SRE: o currículo cita apenas "uso básico de logs no CloudWatch"; a entrevista não explorou métricas de latência, SLOs, tracing distribuído ou atuação em incidentes críticos (evidência ausente no dossiê).
- Colaboração: colaborou bem na etapa de pair programming, porém não há registro concreto sobre condução de RFCs ou mentoria formal de outros engenheiros.`,
      },
      {
        id: 'cand-lucas',
        name: 'Lucas Ferreira',
        summary: 'Perfil desalinhado — foco predominante em frontend e CRUDs simples',
        dossier: `Dossiê — Lucas Ferreira (4 anos em Desenvolvimento Web)

Experiência verificada:
- Atuou principalmente no desenvolvimento de interfaces React/Next.js, landing pages e manutenção de sites WordPress para agências digitais.
- No backend, implementou apenas endpoints CRUD pontuais em Express com ORM padrão, sem participar de decisões de modelagem transacional ou tuning de consultas SQL.
- Notas da entrevista técnica: teve dificuldade para explicar níveis de isolamento no PostgreSQL, estratégias de retry com backoff ou mecanismos básicos de cache distribuído.
- Não possui experiência prévia com observabilidade em produção, definição de SLIs/SLOs ou resposta a incidentes distribuídos.`,
      },
    ],
    criteria: [
      {
        id: 'crit-arquitetura',
        label: 'Arquitetura Distribuída & APIs',
        description:
          'Desenho de serviços resilientes, idempotência, mensageria e contratos de API sob concorrência.',
        weight: 0.3,
      },
      {
        id: 'crit-dados',
        label: 'Banco de Dados & Performance',
        description:
          'Modelagem relacional, otimização de consultas e índices, transações e cache distribuído.',
        weight: 0.25,
      },
      {
        id: 'crit-sre',
        label: 'Observabilidade & Confiabilidade (SRE)',
        description:
          'Instrumentação, tracing, SLOs, testes de resiliência e condução estruturada de incidentes.',
        weight: 0.25,
      },
      {
        id: 'crit-colaboracao',
        label: 'Colaboração Técnica & Mentoria',
        description:
          'Escrita de RFCs, revisão de código, mentoria técnica e comunicação de riscos com produto.',
        weight: 0.2,
      },
    ],
    grades: [...DEFAULT_RUBRIC_GRADES],
    gradeUtilities: [...DEFAULT_GRADE_UTILITIES],
    evaluators: [
      {
        id: 'eval-techlead',
        name: 'Tech Lead de Plataforma',
        role: 'Liderança Técnica',
        focusPrompt:
          'Avalie rigorosamente evidências concretas de código em produção, trade-offs arquiteturais, maturidade de dados e impacto na mentoria da equipe.',
      },
      {
        id: 'eval-sre',
        name: 'Arquitetura & Confiabilidade (SRE)',
        role: 'Confiabilidade & Escala',
        focusPrompt:
          'Priorize evidências objetivas de tolerância a falhas, comportamento sob carga, isolamento transacional e práticas verificáveis de observabilidade.',
      },
      {
        id: 'eval-produto',
        name: 'Product & Negócio',
        role: 'Produto & Colaboração',
        focusPrompt:
          'Avalie autonomia para transformar requisitos de negócio em entregas confiáveis, clareza na comunicação de riscos e colaboração interdisciplinar.',
      },
    ],
  },
  {
    id: 'data-science-ml',
    title: 'Ciência de Dados & Machine Learning',
    subtitle: 'Modelagem estatística, MLOps em produção, experimentação causal e impacto de negócio.',
    vagaTexto: `Vaga: Cientista de Dados / ML Sênior (Risco, Retenção & Decisão Automatizada)

Contexto da posição:
Buscamos especialista para projetar, validar e operar modelos preditivos e experimentos controlados que orientam limites de crédito, prevenção a churn e políticas de recomendação.

Requisitos e expectativas:
1. Modelagem Estatística & ML: domínio sólido de aprendizado supervisionado, calibração de probabilidades, validação temporal, tratamento de desbalanceamento e interpretabilidade.
2. Engenharia de Dados & MLOps: capacidade de construir pipelines reprodutíveis (Python, SQL, feature stores, CI/CD de modelos), monitorar data drift e garantir SLAs de inferência.
3. Experimentação & Rigor Metodológico: desenho e análise de testes A/B, poder estatístico, controle de viés de seleção/vazamento (data leakage) e inferência causal aplicada.
4. Tradução para Negócio & Comunicação: alinhar métricas técnicas (AUC, calibração) a indicadores econômicos com stakeholders e documentar limitações dos modelos.`,
    candidates: [
      {
        id: 'cand-camila',
        name: 'Camila Albuquerque',
        summary: 'Perfil aderente com ciclo completo de ML e experimentação em produção',
        dossier: `Dossiê — Camila Albuquerque (6 anos em Ciência de Dados)

Experiência verificada:
- Liderou o desenvolvimento e operação de modelos de propensão a churn e escoragem de risco em fintech (LightGBM + regressão logística calibrada com isotonic calibration), elevando o ganho líquido de retenção em R$ 4,2 milhões/ano após teste A/B com 180 mil usuários.
- Estruturou pipelines reprodutíveis em Python/SQL/dbt com versionamento de features, validação temporal estrita (out-of-time) e alertas automatizados de PSI/data drift e latência (< 40 ms p95).
- Na entrevista técnica identificou corretamente vazamento temporal em um dataset de exemplo e propôs estratégia de uplift modeling com controle de variáveis confundidoras.
- Publicou playbooks internos de decisão para gerentes de produto e comitê de risco explicando limites de confiança e cobertura do modelo.`,
      },
      {
        id: 'cand-thiago',
        name: 'Thiago Nogueira',
        summary: 'Forte base teórica/acadêmica, mas sem evidência clara de produção e negócio',
        dossier: `Dossiê — Thiago Nogueira (Mestrado + 2,5 anos em P&D)

Experiência e notas da entrevista:
- Excelente histórico acadêmico em aprendizado de máquina (PyTorch e scikit-learn), com dois artigos aplicados em séries temporais e visão computacional.
- Na etapa de modelagem apresentou análise exploratória rigorosa, validação cruzada estratificada e discussão consistente sobre função de perda e calibração.
- Lacunas explícitas no dossiê: os projetos mencionados rodaram apenas em notebooks locais com datasets estáticos; não há evidência de deploy em produção, pipelines automatizados, testes A/B com usuários reais ou monitoramento de drift.
- O dossiê também não informa como suas métricas de modelo foram traduzidas em KPIs financeiros ou operacionais junto a áreas de negócio.`,
      },
      {
        id: 'cand-beatriz',
        name: 'Beatriz Costa',
        summary: 'Perfil desalinhado — atuação focada em BI descritivo e dashboards',
        dossier: `Dossiê — Beatriz Costa (5 anos em Business Intelligence)

Experiência verificada:
- Forte experiência na construção de dashboards executivos no Power BI/Looker e consultas SQL descritivas para acompanhamento semanal de vendas.
- Não possui experiência prática com modelagem preditiva, scikit-learn/Python para ML, validação cruzada ou desenho estatístico de testes A/B.
- Notas da entrevista: confundiu correlação observacional com efeito causal ao analisar uma campanha promocional e não soube definir prevenção de data leakage nem métricas de calibração.`,
      },
    ],
    criteria: [
      {
        id: 'crit-modelagem',
        label: 'Modelagem Estatística & ML',
        description:
          'Escolha de algoritmos, validação temporal, calibração probabilística e prevenção de data leakage.',
        weight: 0.3,
      },
      {
        id: 'crit-mlops',
        label: 'Engenharia de Dados & MLOps',
        description:
          'Pipelines reprodutíveis, SQL/Python escalável, deploy com SLA e monitoramento de drift.',
        weight: 0.25,
      },
      {
        id: 'crit-experimentos',
        label: 'Experimentação & Rigor Metodológico',
        description:
          'Desenho de testes A/B, cálculo de poder, inferência causal e controle de viés.',
        weight: 0.25,
      },
      {
        id: 'crit-negocio',
        label: 'Tradução para Negócio & Comunicação',
        description:
          'Conexão de métricas do modelo a decisões econômicas e comunicação transparente de limitações.',
        weight: 0.2,
      },
    ],
    grades: [...DEFAULT_RUBRIC_GRADES],
    gradeUtilities: [...DEFAULT_GRADE_UTILITIES],
    evaluators: [
      {
        id: 'eval-ml-eng',
        name: 'Staff ML Engineer',
        role: 'Engenharia & MLOps',
        focusPrompt:
          'Verifique evidências concretas de código em produção, reprodutibilidade de pipelines, versionamento e monitoramento pós-deploy.',
      },
      {
        id: 'eval-pesquisa',
        name: 'Pesquisa Aplicada & Estatística',
        role: 'Rigor Científico',
        focusPrompt:
          'Avalie rigor estatístico, prevenção de data leakage, calibração, validade causal de experimentos e explicitação de incertezas.',
      },
      {
        id: 'eval-negocio-ds',
        name: 'Product & Negócio',
        role: 'Impacto & Estratégia',
        focusPrompt:
          'Priorize pragmatismo na tradução de modelos em decisões acionáveis, comunicação clara com stakeholders e foco em impacto mensurável.',
      },
    ],
  },
];

export interface SyntheticDemoData {
  isSyntheticLocal: true;
  title: string;
  notice: string;
  vagaTexto: string;
  candidates: StochasticCandidate[];
  criteria: StochasticCriterion[];
  grades: string[];
  gradeUtilities: number[];
  evaluators: StochasticEvaluator[];
  input: ConsensusInput;
}

/**
 * Exact match to skills/stochastic-belief-consensus/references/synthetic-input.json
 * with PT-BR synthetic labels (no API call required).
 */
export const SYNTHETIC_DEMO_DATA: SyntheticDemoData = {
  isSyntheticLocal: true,
  title: 'Exemplo Pronto (Demonstração)',
  notice:
    'Este é um exemplo pronto de demonstração com 3 avaliadores, 2 candidatos e 2 critérios para você explorar o painel sem precisar de chave de acesso.',
  vagaTexto:
    'Vaga de demonstração: 2 candidatos comparados por uma banca de 3 avaliadores em 2 critérios principais (Domínio Técnico e Comunicação & Liderança), com algumas lacunas de informação no currículo para ilustrar como o painel sinaliza pontos a investigar na entrevista.',
  candidates: [
    {
      id: 'synth-cand-a',
      name: 'Candidato Exemplo A',
      summary: 'Perfil com forte aderência e poucas lacunas nos critérios',
      dossier:
        'Perfil de demonstração A: apresenta histórico consistente nos dois critérios avaliados pela banca, com 80% das evidências cobertas no currículo.',
    },
    {
      id: 'synth-cand-b',
      name: 'Candidato Exemplo B',
      summary: 'Perfil com aderência moderada/baixa nos requisitos principais',
      dossier:
        'Perfil de demonstração B: apresenta aderência parcial aos requisitos da vaga e pontos que merecem aprofundamento na entrevista.',
    },
  ],
  criteria: [
    {
      id: 'synth-crit-1',
      label: 'Domínio Técnico',
      description: 'Experiência prática nos requisitos essenciais da posição.',
      weight: 0.5,
    },
    {
      id: 'synth-crit-2',
      label: 'Comunicação e Liderança',
      description: 'Clareza na comunicação, autonomia e trabalho em equipe.',
      weight: 0.5,
    },
  ],
  grades: ['Baixo', 'Médio', 'Alto'],
  gradeUtilities: [0, 0.5, 1],
  evaluators: [
    {
      id: 'synth-eval-1',
      name: 'Liderança Técnica',
      role: 'Gestor da Área',
      focusPrompt: 'Foco em entregas práticas, domínio técnico e autonomia.',
    },
    {
      id: 'synth-eval-2',
      name: 'Pessoas & Cultura (RH)',
      role: 'Recrutamento & Seleção',
      focusPrompt: 'Foco em colaboração, comunicação e alinhamento cultural.',
    },
    {
      id: 'synth-eval-3',
      name: 'Parceiro de Negócio',
      role: 'Produto & Operações',
      focusPrompt: 'Foco em visão de negócio, priorização e impacto prático.',
    },
  ],
  input: {
    matrices: [
      [
        [
          [0.1, 0.6, 0.1],
          [0.0, 0.3, 0.5],
        ],
        [
          [0.4, 0.3, 0.1],
          [0.5, 0.2, 0.1],
        ],
      ],
      [
        [
          [0.0, 0.5, 0.3],
          [0.1, 0.2, 0.5],
        ],
        [
          [0.3, 0.4, 0.1],
          [0.4, 0.3, 0.1],
        ],
      ],
      [
        [
          [0.1, 0.4, 0.3],
          [0.0, 0.4, 0.4],
        ],
        [
          [0.5, 0.2, 0.1],
          [0.3, 0.4, 0.1],
        ],
      ],
    ],
    alpha: 0.5,
    threshold: 0.8,
    trials: 4000,
    seed: 42,
    allocation: {
      family: 'uniform-simplex',
      independent_cells: true,
    },
  },
};

export interface QuickChoiceOption {
  key: string;
  description: string;
}

export interface QuickQuestionDraft {
  id: string;
  key: string;
  type: SubqQuestionType;
  instructions: string;
  choiceOptions: QuickChoiceOption[];
  scoreCriteria: string[];
  noulTrue: string;
  noulFalse: string;
}

export interface QuickPreset {
  id: string;
  label: string;
  description: string;
  state: string;
  questions: QuickQuestionDraft[];
}

export const QUICK_PRESETS: QuickPreset[] = [
  {
    id: 'triar-candidato',
    label: 'Triar candidato',
    description: 'Decisão de triagem inicial, nota geral de aderência e verificação de evidências no currículo.',
    state: `Vaga: Pessoa Desenvolvedora Full-Stack Pleno (TypeScript, React, Node.js, PostgreSQL).
Requisitos obrigatórios: 3+ anos com TypeScript/React em produção, modelagem SQL e testes automatizados.

Currículo resumido:
- Joana Prado, 4 anos de experiência com React e TypeScript no desenvolvimento de painéis B2B.
- Nos últimos 2 anos atuou também no backend com Node.js, REST APIs e PostgreSQL (migrations, índices e Vitest).
- Mencionou participação em revisões de código, mas não detalhou experiência com mensageria ou Kubernetes.`,
    questions: [
      {
        id: 'qp-triar-1',
        key: 'Decisão de triagem',
        type: 'choice',
        instructions: 'Qual deve ser o encaminhamento desta candidatura na triagem inicial?',
        choiceOptions: [
          {
            key: 'Avançar para entrevista',
            description: 'Cumpre os requisitos obrigatórios e apresenta evidências compatíveis.',
          },
          {
            key: 'Avaliar lacunas',
            description: 'Perfil promissor, mas exige investigação complementar sobre profundidade técnica.',
          },
          {
            key: 'Declinar',
            description: 'Não atende aos requisitos essenciais da vaga.',
          },
        ],
        scoreCriteria: ['Insuficiente', 'Parcial', 'Atende', 'Excepcional'],
        noulTrue: '',
        noulFalse: '',
      },
      {
        id: 'qp-triar-2',
        key: 'Nível de aderência',
        type: 'score',
        instructions: 'Avalie o grau de aderência técnica geral da candidatura aos requisitos da vaga.',
        choiceOptions: [
          { key: 'Sim', description: '' },
          { key: 'Não', description: '' },
        ],
        scoreCriteria: ['Insuficiente', 'Parcial', 'Atende', 'Excepcional'],
        noulTrue: '',
        noulFalse: '',
      },
      {
        id: 'qp-triar-3',
        key: 'Evidência suficiente',
        type: 'noul',
        instructions:
          'O currículo traz evidências concretas suficientes para avaliar a experiência prática sem precisar fazer suposições?',
        choiceOptions: [
          { key: 'Sim', description: '' },
          { key: 'Não', description: '' },
        ],
        scoreCriteria: ['Insuficiente', 'Parcial', 'Atende', 'Excepcional'],
        noulTrue: 'Há descrição explícita de projetos, tecnologias e responsabilidades verificáveis.',
        noulFalse: 'Faltam evidências objetivas ou o histórico está genérico demais.',
      },
    ],
  },
  {
    id: 'aderencia-tecnica',
    label: 'Avaliar aderência técnica',
    description: 'Enquadramento de senioridade e nota de profundidade técnica com base na entrevista.',
    state: `Especificação técnica da vaga:
- Arquitetura de APIs de baixa latência (Go ou Node.js)
- Otimização de consultas em PostgreSQL e cache em Redis
- Observabilidade (OpenTelemetry, métricas, SLOs)

Notas da entrevista técnica:
O candidato desenhou corretamente um fluxo com fila assíncrona e chave de idempotência para evitar cobranças duplicadas. Explicou planos de execução EXPLAIN ANALYZE no Postgres, porém afirmou nunca ter configurado tracing distribuído nem definido SLOs formalmente.`,
    questions: [
      {
        id: 'qp-tec-1',
        key: 'Enquadramento de senioridade',
        type: 'choice',
        instructions: 'Qual nível de senioridade melhor descreve o desempenho demonstrado na entrevista?',
        choiceOptions: [
          {
            key: 'Júnior',
            description: 'Domínio básico, necessita supervisão frequente em arquitetura.',
          },
          {
            key: 'Pleno',
            description: 'Boa autonomia em APIs e SQL, mas ainda com lacunas em observabilidade/operação.',
          },
          {
            key: 'Sênior',
            description: 'Domínio completo de arquitetura distribuída, dados e confiabilidade em produção.',
          },
        ],
        scoreCriteria: ['Insuficiente', 'Parcial', 'Atende', 'Excepcional'],
        noulTrue: '',
        noulFalse: '',
      },
      {
        id: 'qp-tec-2',
        key: 'Profundidade em arquitetura',
        type: 'score',
        instructions: 'Pontue a profundidade demonstrada em arquitetura distribuída e bancos de dados.',
        choiceOptions: [
          { key: 'Baixo', description: '' },
          { key: 'Alto', description: '' },
        ],
        scoreCriteria: ['Básico', 'Intermediário', 'Sólido', 'Avançado'],
        noulTrue: '',
        noulFalse: '',
      },
    ],
  },
  {
    id: 'checagem-prerequisitos',
    label: 'Checagem de pré-requisitos',
    description: 'Verificação objetiva de requisitos obrigatórios (Sim ou Não) e recomendação de próxima etapa.',
    state: `Política mínima de contratação para Engenheiro(a) de Dados:
1. Experiência comprovada com SQL analítico e modelagem dimensional (obrigatório).
2. Disponibilidade para atuação híbrida em São Paulo (obrigatório).
3. Experiência com Apache Airflow ou dbt (desejável).

Resumo do candidato:
Mora em Campinas com disponibilidade confirmada para modelo híbrido em São Paulo 2x/semana. Possui 5 anos de experiência escrevendo SQL analítico complexo em BigQuery e modelos em dbt; nunca utilizou Airflow diretamente.`,
    questions: [
      {
        id: 'qp-pre-1',
        key: 'Atende obrigatórios',
        type: 'noul',
        instructions:
          'O candidato atende integralmente a todos os pré-requisitos obrigatórios da política da vaga?',
        choiceOptions: [
          { key: 'Sim', description: '' },
          { key: 'Não', description: '' },
        ],
        scoreCriteria: ['Não atende', 'Parcial', 'Atende'],
        noulTrue: 'Cumpre experiência obrigatória em SQL/modelagem e disponibilidade híbrida.',
        noulFalse: 'Descumpre ou não comprova ao menos um requisito obrigatório.',
      },
      {
        id: 'qp-pre-2',
        key: 'Próxima etapa',
        type: 'choice',
        instructions: 'Qual ação recomendar ao time de recrutamento?',
        choiceOptions: [
          {
            key: 'Agendar estudo de caso',
            description: 'Avançar diretamente para o estudo de caso técnico.',
          },
          {
            key: 'Alinhamento de ferramentas',
            description: 'Fazer breve alinhamento sobre orquestração antes do case.',
          },
          {
            key: 'Encerrar processo',
            description: 'Encerrar candidatura por incompatibilidade com pré-requisitos.',
          },
        ],
        scoreCriteria: ['Não', 'Talvez', 'Sim'],
        noulTrue: '',
        noulFalse: '',
      },
    ],
  },
];

/**
 * Converts UI Playground question drafts into a sanitized Record<string, SubqQuestion>
 * compatible with POST /api/decide validation rules.
 */
export function buildQuickQuestionsPayload(
  drafts: readonly QuickQuestionDraft[],
): Record<string, SubqQuestion> {
  const payload: Record<string, SubqQuestion> = {};
  const usedQuestionKeys = new Set<string>();

  drafts.forEach((draft, idx) => {
    const key = slugifyKey(
      draft.key.trim() || draft.instructions.trim() || `pergunta_${idx + 1}`,
      usedQuestionKeys,
    );
    const instructions = draft.instructions.trim();

    if (draft.type === 'choice') {
      const criteria: Record<string, string | null> = {};
      const usedOptionKeys = new Set<string>();
      draft.choiceOptions.forEach((opt, optIdx) => {
        const optKey = slugifyKey(
          opt.key.trim() || opt.description.trim() || `opcao_${optIdx + 1}`,
          usedOptionKeys,
        );
        const desc = typeof opt.description === 'string' ? opt.description.trim() : '';
        criteria[optKey] = desc ? desc : null;
      });
      payload[key] = {
        type: 'choice',
        instructions,
        criteria,
      };
      return;
    }

    if (draft.type === 'score') {
      payload[key] = {
        type: 'score',
        instructions,
        criteria: draft.scoreCriteria.map((c) => c.trim()).filter((c) => c.length > 0),
      };
      return;
    }

    const trueDesc = draft.noulTrue.trim();
    const falseDesc = draft.noulFalse.trim();
    const noulQuestion: SubqQuestion = {
      type: 'noul',
      instructions,
    };
    if (trueDesc || falseDesc) {
      noulQuestion.criteria = {
        ...(trueDesc ? { true: trueDesc } : {}),
        ...(falseDesc ? { false: falseDesc } : {}),
      };
    }
    payload[key] = noulQuestion;
  });

  return payload;
}

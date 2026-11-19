import { useEffect, useId, useMemo, useState } from 'react';
import { Check, Code2, Copy, ExternalLink } from 'lucide-react';
import type { SubqQuestion } from '../types/subq';
import { buildApiSnippets } from '../lib/codeSnippets';
import { DialogShell, PillButton } from './ui';

type SnippetLang = 'curl' | 'python' | 'typescript';

export function ApiCodeDialog({
  open,
  onClose,
  payload,
}: {
  open: boolean;
  onClose: () => void;
  payload: {
    model: 'subq-snap-1.2';
    state: string | Record<string, unknown>;
    questions: Record<string, SubqQuestion>;
  };
}) {
  const titleId = useId();
  const [lang, setLang] = useState<SnippetLang>('curl');
  const [copied, setCopied] = useState(false);

  const snippets = useMemo(() => buildApiSnippets(payload), [payload]);
  const activeCode = snippets[lang];

  useEffect(() => {
    setCopied(false);
  }, [lang, open, activeCode]);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(activeCode);
      } else {
        const el = document.createElement('textarea');
        el.value = activeCode;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const tabs: Array<{ id: SnippetLang; label: string }> = [
    { id: 'curl', label: 'cURL' },
    { id: 'python', label: 'Python' },
    { id: 'typescript', label: 'TypeScript' },
  ];

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      titleId={titleId}
      title="Código da Requisição (subq-snap-1.2)"
      subtitle="Copie o payload exato para integrar diretamente à API oficial da SubQ."
      maxWidthClass="max-w-3xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <a
              href="https://docs.subq.ai/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-[var(--sq-content-primary)] hover:text-[var(--accent-blue)] hover:underline"
            >
              <span>Docs da API</span>
              <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href="https://console.subq.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-[var(--accent-blue)] hover:underline"
            >
              <span>Obter chave API ↗</span>
            </a>
          </div>
          <PillButton variant="default" onClick={onClose}>
            Fechar
          </PillButton>
        </div>
      }
    >
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="radiogroup"
            aria-label="Linguagem do exemplo de código"
            className="inline-flex rounded-full border border-[var(--sq-rule-strong)] bg-[var(--sq-surface-secondary)] p-0.5"
          >
            {tabs.map((tab) => {
              const selected = lang === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setLang(tab.id)}
                  className={`cursor-pointer rounded-full px-3.5 py-1 font-mono text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-blue)] ${
                    selected
                      ? 'bg-[var(--sq-content-primary)] text-[var(--sq-surface-primary)]'
                      : 'text-[var(--sq-content-secondary)] hover:text-[var(--sq-content-primary)]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <PillButton onClick={handleCopy}>
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-[var(--accent-green)]" />
                <span>Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copiar código</span>
              </>
            )}
          </PillButton>
        </div>

        <div className="relative min-w-0">
          <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[11px] text-[var(--sq-content-secondary)]">
            <Code2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">POST https://api.subq.ai/v1/systemone · model: subq-snap-1.2</span>
          </div>
          <pre className="max-h-[420px] max-w-full overflow-auto rounded-[8px] border border-[var(--sq-rule-strong)] bg-[var(--sq-surface-secondary)] p-4 font-mono text-xs leading-relaxed text-[var(--sq-content-primary)]">
            <code>{activeCode}</code>
          </pre>
        </div>
      </div>
    </DialogShell>
  );
}

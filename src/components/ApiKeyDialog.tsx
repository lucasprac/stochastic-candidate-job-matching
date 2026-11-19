import { useEffect, useId, useState } from 'react';
import { Eye, EyeOff, KeyRound, Monitor, Moon, Sun, Trash2 } from 'lucide-react';
import { AlertBanner, DialogShell, PillButton } from './ui';

export function ApiKeyDialog({
  open,
  onClose,
  currentKey,
  persistent,
  hasServerKey,
  onSaveKey,
  onClearKey,
  colorScheme,
  onColorSchemeChange,
}: {
  open: boolean;
  onClose: () => void;
  currentKey: string;
  persistent: boolean;
  hasServerKey: boolean;
  onSaveKey: (key: string, persistent: boolean) => void;
  onClearKey: () => void;
  colorScheme: 'system' | 'light' | 'dark';
  onColorSchemeChange: (s: 'system' | 'light' | 'dark') => void;
}) {
  const titleId = useId();
  const keyInputId = useId();
  const persistId = useId();

  const [draftKey, setDraftKey] = useState(currentKey);
  const [draftPersistent, setDraftPersistent] = useState(persistent);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (open) {
      setDraftKey(currentKey);
      setDraftPersistent(persistent);
      setShowKey(false);
    }
  }, [open, currentKey, persistent]);

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = draftKey.trim();
    if (!trimmed) {
      onClearKey();
    } else {
      onSaveKey(trimmed, draftPersistent);
    }
    onClose();
  };

  const handleClear = () => {
    setDraftKey('');
    onClearKey();
  };

  const schemeOptions: Array<{
    value: 'system' | 'light' | 'dark';
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { value: 'system', label: 'Automático', icon: Monitor },
    { value: 'light', label: 'Claro', icon: Sun },
    { value: 'dark', label: 'Escuro', icon: Moon },
  ];

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      titleId={titleId}
      title="Configurações de Acesso e Aparência"
      subtitle="Gerencie a chave de acesso para avaliações com IA e o tema visual da tela."
      maxWidthClass="max-w-lg"
    >
      <form onSubmit={handleSave} className="space-y-5">
        {hasServerKey ? (
          <AlertBanner tone="info" title="Acesso já configurado no ambiente">
            A chave de acesso já está configurada automaticamente neste servidor. Preencher o campo
            abaixo é opcional caso queira usar uma chave própria.
          </AlertBanner>
        ) : null}

        <div className="space-y-2">
          <label
            htmlFor={keyInputId}
            className="flex items-center gap-1.5 text-xs font-semibold text-[var(--sq-content-primary)]"
          >
            <KeyRound className="h-3.5 w-3.5 text-[var(--accent-blue)]" />
            <span>Chave de acesso da IA</span>
          </label>

          <div className="relative flex items-center">
            <input
              id={keyInputId}
              type={showKey ? 'text' : 'password'}
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              placeholder="Cole sua chave de acesso..."
              autoComplete="off"
              spellCheck={false}
              className="sq-input py-2 pr-10 pl-3 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => setShowKey((prev) => !prev)}
              aria-label={showKey ? 'Ocultar chave de acesso' : 'Mostrar chave de acesso'}
              className="absolute right-2 cursor-pointer rounded p-1 text-[var(--sq-content-secondary)] hover:bg-[var(--sq-ghost)] hover:text-[var(--sq-content-primary)]"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <p className="text-[11px] leading-relaxed text-[var(--sq-content-secondary)]">
            Sua chave fica salva apenas neste navegador e é usada somente para processar suas
            avaliações com segurança.
          </p>
        </div>

        <label
          htmlFor={persistId}
          className="flex cursor-pointer items-start gap-2.5 rounded-[8px] border border-[var(--sq-rule)] bg-[var(--sq-surface-secondary)] px-3 py-2.5 text-xs"
        >
          <input
            id={persistId}
            type="checkbox"
            checked={draftPersistent}
            onChange={(e) => setDraftPersistent(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded"
          />
          <div>
            <span className="font-medium text-[var(--sq-content-primary)]">
              Manter chave salva neste navegador
            </span>
            <p className="mt-0.5 text-[11px] text-[var(--sq-content-secondary)]">
              Se desmarcar, a chave será apagada automaticamente quando você fechar esta aba.
            </p>
          </div>
        </label>

        {currentKey || draftKey ? (
          <div className="flex justify-end">
            <PillButton variant="danger" onClick={handleClear}>
              <Trash2 className="h-3.5 w-3.5" />
              <span>Remover chave salva</span>
            </PillButton>
          </div>
        ) : null}

        <hr className="border-[var(--sq-rule)]" />

        {/* 3-state appearance switcher */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[var(--sq-content-primary)]">Aparência da tela</p>
          <div
            role="radiogroup"
            aria-label="Tema de aparência"
            className="grid grid-cols-3 gap-2"
          >
            {schemeOptions.map(({ value, label, icon: Icon }) => {
              const selected = colorScheme === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onColorSchemeChange(value)}
                  className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-[8px] border px-3 py-2 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-blue)] ${
                    selected
                      ? 'border-[var(--sq-content-primary)] bg-[var(--sq-content-primary)] text-[var(--sq-surface-primary)]'
                      : 'border-[var(--sq-rule-strong)] bg-[var(--sq-surface-secondary)] text-[var(--sq-content-primary)] hover:border-[var(--sq-content-primary)]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--sq-rule)] pt-4">
          <PillButton variant="ghost" onClick={onClose}>
            Cancelar
          </PillButton>
          <PillButton type="submit" variant="primary">
            Salvar configurações
          </PillButton>
        </div>
      </form>
    </DialogShell>
  );
}

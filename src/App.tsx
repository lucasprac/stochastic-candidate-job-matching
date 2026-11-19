import { useCallback, useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { fetchHealth } from './lib/snap';
import {
  applyColorScheme,
  clearApiKey,
  getColorSchemeOverride,
  getStoredApiKey,
  saveApiKey,
  subscribeStorageChanges,
  type ColorSchemePreference,
} from './lib/apiKey';
import { AlertBanner, PillButton } from './components/ui';
import { Header, type AppMode } from './components/Header';
import { ProjectHero } from './components/ProjectHero';
import { Footer } from './components/Footer';
import { ApiKeyDialog } from './components/ApiKeyDialog';
import { StochasticEvaluator } from './components/StochasticEvaluator';
import { QuickPlayground } from './components/QuickPlayground';

export function App() {
  const [mode, setMode] = useState<AppMode>('stochastic');
  const [hasServerKey, setHasServerKey] = useState(false);
  const [isStaticHost, setIsStaticHost] = useState(false);
  const [healthChecked, setHealthChecked] = useState(false);
  const [exploreDemoNonce, setExploreDemoNonce] = useState(0);

  const [storedKeyState, setStoredKeyState] = useState(() => getStoredApiKey());
  const [colorScheme, setColorScheme] = useState<ColorSchemePreference>(() =>
    getColorSchemeOverride(),
  );

  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    applyColorScheme(colorScheme);
  }, [colorScheme]);

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then((health) => {
        setHasServerKey(Boolean(health.hasServerKey));
        setIsStaticHost(false);
        setHealthChecked(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setIsStaticHost(true);
          setHealthChecked(true);
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    return subscribeStorageChanges(() => {
      setStoredKeyState(getStoredApiKey());
      setColorScheme(getColorSchemeOverride());
    });
  }, []);

  const handleSaveKey = useCallback((nextKey: string, persistent: boolean) => {
    saveApiKey(nextKey, persistent);
    setStoredKeyState(getStoredApiKey());
    setBannerDismissed(false);
  }, []);

  const handleClearKey = useCallback(() => {
    clearApiKey();
    setStoredKeyState({ key: '', persistent: false });
  }, []);

  const handleColorSchemeChange = useCallback((scheme: ColorSchemePreference) => {
    applyColorScheme(scheme);
    setColorScheme(scheme);
  }, []);

  const handleToggleColorScheme = useCallback(() => {
    const currentlyDark =
      colorScheme === 'dark' ||
      (colorScheme === 'system' &&
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    const next: ColorSchemePreference = currentlyDark ? 'light' : 'dark';
    applyColorScheme(next);
    setColorScheme(next);
  }, [colorScheme]);

  const handleExploreDemo = useCallback(() => {
    setMode('stochastic');
    setExploreDemoNonce((n) => n + 1);
  }, []);

  const apiKeyStatus: 'custom' | 'server' | 'missing' = storedKeyState.key.trim()
    ? 'custom'
    : hasServerKey
      ? 'server'
      : 'missing';

  const showMissingKeyBanner =
    healthChecked && !isStaticHost && apiKeyStatus === 'missing' && !bannerDismissed;

  const showStaticHostBanner = healthChecked && isStaticHost && !bannerDismissed;

  return (
    <div
      id="top"
      className="flex min-h-screen flex-col bg-[var(--sq-surface-primary)] text-[var(--sq-content-primary)]"
    >
      <Header
        mode={mode}
        onModeChange={setMode}
        apiKeyStatus={apiKeyStatus}
        isStaticHost={isStaticHost}
        colorScheme={colorScheme}
        onToggleColorScheme={handleToggleColorScheme}
        onOpenApiKeyDialog={() => setKeyDialogOpen(true)}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 min-w-0 px-4 py-6 sm:px-6">
        <ProjectHero isStaticHost={isStaticHost} onExploreDemo={handleExploreDemo} />

        {showStaticHostBanner ? (
          <div className="mb-5">
            <AlertBanner
              tone="info"
              title="Demonstração interativa no GitHub Pages — motor estocástico 100% no navegador"
              onDismiss={() => setBannerDismissed(true)}
            >
              <p>
                Um estudo de caso completo já foi carregado abaixo: ajuste pesos dos critérios,
                parâmetro de rigor (α), simulações Monte Carlo e edite as matrizes de crença em
                tempo real. Para executar novas avaliações com IA via proxy local (
                <code>/api/decide</code>), clone o repositório e rode <code>npm run dev</code>.
              </p>
            </AlertBanner>
          </div>
        ) : null}

        {showMissingKeyBanner ? (
          <div className="mb-5">
            <AlertBanner
              tone="info"
              title="Modo demonstração disponível — chave de acesso ainda não configurada"
              onDismiss={() => setBannerDismissed(true)}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p>
                  Para avaliar seus próprios currículos e vagas com IA, informe sua chave de acesso
                  nas configurações. Se preferir, você já pode explorar o painel clicando em{' '}
                  <strong>Ver exemplo pronto</strong>.
                </p>
                <PillButton variant="default" onClick={() => setKeyDialogOpen(true)}>
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>Configurar acesso</span>
                </PillButton>
              </div>
            </AlertBanner>
          </div>
        ) : null}

        {mode === 'stochastic' ? (
          <StochasticEvaluator
            apiKey={storedKeyState.key}
            hasServerKey={hasServerKey}
            autoLoadDemo={isStaticHost}
            exploreDemoNonce={exploreDemoNonce}
            onOpenApiKeyDialog={() => setKeyDialogOpen(true)}
          />
        ) : (
          <QuickPlayground
            apiKey={storedKeyState.key}
            hasServerKey={hasServerKey}
            onOpenApiKeyDialog={() => setKeyDialogOpen(true)}
          />
        )}
      </main>

      <Footer />

      <ApiKeyDialog
        open={keyDialogOpen}
        onClose={() => setKeyDialogOpen(false)}
        currentKey={storedKeyState.key}
        persistent={storedKeyState.persistent}
        hasServerKey={hasServerKey}
        onSaveKey={handleSaveKey}
        onClearKey={handleClearKey}
        colorScheme={colorScheme}
        onColorSchemeChange={handleColorSchemeChange}
      />
    </div>
  );
}

export default App;

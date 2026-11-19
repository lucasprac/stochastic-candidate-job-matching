import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createSnapMiddleware } from './snap-server';

function subqSnapProxyPlugin(env: Record<string, string | undefined>): Plugin {
  const middleware = createSnapMiddleware(env);
  return {
    name: 'subq-snap-proxy',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig(({ mode }) => {
  const loadedEnv = loadEnv(mode, process.cwd(), '');
  const serverEnv: Record<string, string | undefined> = {
    ...process.env,
    ...loadedEnv,
  };

  return {
    base: './',
    plugins: [react(), tailwindcss(), subqSnapProxyPlugin(serverEnv)],
    server: {
      host: 'localhost',
      port: 5173,
    },
    preview: {
      host: 'localhost',
      port: 4173,
    },
  };
});

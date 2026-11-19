import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createSnapMiddleware } from './snap-server';
import { CONTENT_SECURITY_POLICY_META, SECURITY_HEADERS } from './security-headers';

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

// Build only: the dev server needs inline scripts and a websocket for HMR, which this
// policy blocks. Static hosts that cannot send headers (GitHub Pages) get the meta tag.
function cspMetaPlugin(): Plugin {
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      // Insert right after <meta charset> so the charset stays first and the policy is
      // active before any script tag. The policy contains no double quotes.
      const charsetTag = '<meta charset="UTF-8" />';
      if (!html.includes(charsetTag)) {
        throw new Error('csp-meta: <meta charset="UTF-8" /> not found in index.html');
      }
      return html.replace(
        charsetTag,
        `${charsetTag}\n    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY_META}" />`,
      );
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
    plugins: [react(), tailwindcss(), cspMetaPlugin(), subqSnapProxyPlugin(serverEnv)],
    server: {
      host: 'localhost',
      port: 5173,
    },
    preview: {
      host: 'localhost',
      port: 4173,
      headers: SECURITY_HEADERS,
    },
  };
});

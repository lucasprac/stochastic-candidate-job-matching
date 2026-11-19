// Vercel Node.js function for GET /api/health.
// The `.js` extension is required for Node.js ES module resolution ("type": "module");
// TypeScript resolves it to snap-server.ts.
import { createServerlessHandler } from '../snap-server.js';

export default createServerlessHandler();

// Keep the raw request stream readable for the shared JSON reader (same as the
// Vercel raw-body examples). Ignored by runtimes that do not parse bodies.
export const config = { api: { bodyParser: false } };

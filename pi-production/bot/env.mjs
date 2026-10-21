// Where the app lives + the bot's key, so the same bot scripts work against localhost or the online server.
// Read from bot/.env when it exists (copy bot/.env.example); real environment variables win. PI_URL is the app.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(here, '.env')); } catch {}

export const BASE = (process.env.PI_URL || process.env.PI_BRAINSTORM_URL || 'http://localhost:3144').replace(/\/+$/, '');
export const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(BASE);
// long-polls stay under the ~60 s idle cut most hosting proxies apply
export const POLL_MS = LOCAL ? 100000 : 50000;
export const headers = (extra = {}) => ({ ...extra, ...(process.env.PI_BOT_KEY ? { authorization: `Bearer ${process.env.PI_BOT_KEY}` } : {}) });

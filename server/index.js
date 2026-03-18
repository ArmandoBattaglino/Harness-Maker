// server/index.js — Express server stub for Claude Code Visual Manager
// Serves the built React SPA from server/public and exposes a /health endpoint
// Full API and WebSocket implementation added in Task #3 by backend-dev
import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { WebSocketServer } from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

app.get('/health', (req, res) => res.json({ status: 'ok', version: '0.1.0' }));

// SPA fallback — all non-API routes return index.html
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

const server = createServer(app);
const wss = new WebSocketServer({ server });

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Claude Code Visual Manager running at http://127.0.0.1:${PORT}`);
});

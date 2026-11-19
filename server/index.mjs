import { createApp } from './app.mjs';
import express from 'express';
import path from 'node:path';

const production = process.argv.includes('--production');
const app = await createApp();
let vite;
if (production) {
  app.use(express.static(path.resolve('dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
} else {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT) || 5173;
const server = app.listen(port, '127.0.0.1', () => console.log(`\n  인공지능학부 홈페이지\n  Local: http://127.0.0.1:${port}\n`));
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `${port} 포트가 사용 중입니다. 기존 서버를 종료하거나 PORT 환경변수를 변경해 주세요.` : error.message);
  process.exit(1);
});
async function shutdown() { await vite?.close(); server.close(() => process.exit(0)); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

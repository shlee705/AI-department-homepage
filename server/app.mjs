import express from 'express';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { seedPosts } from './seed.mjs';

const accounts = [
  { id: '261234', name: '관리자', role: 'admin', password: 'admin' },
  { id: '262626', name: '테스트 학생', role: 'student', password: 'test' },
].map(({ password, ...account }) => {
  const salt = randomBytes(16);
  return { ...account, salt, hash: scryptSync(password, salt, 64) };
});
const publicUser = ({ id, name, role }) => ({ id, name, role });

function validatePostInput(input) {
  const { board = 'notices', title, body, category = board === 'careers' ? '신입' : '학과', secret = false, pinned = false, company, deadline } = input;
  const allowedCategories = { notices: ['학과', '학사', '장학', '프로그램'], careers: ['신입', '인턴', '연구'] };
  const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };
  if (typeof board !== 'string' || !Object.hasOwn(allowedCategories, board) || typeof title !== 'string' || !title.trim() || title.trim().length > 120 || typeof body !== 'string' || !body.trim() || body.length > 10_000 || !allowedCategories[board].includes(category) || typeof secret !== 'boolean' || typeof pinned !== 'boolean') {
    invalid('제목(120자 이내)과 본문(10,000자 이내)을 올바르게 입력해 주세요.');
  }
  if (board === 'careers') {
    if (secret || pinned) invalid('채용정보에는 비밀글과 상단 고정을 설정할 수 없습니다.');
    const parsedDeadline = typeof deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? new Date(`${deadline}T00:00:00.000Z`) : null;
    if (typeof company !== 'string' || !company.trim() || company.trim().length > 100 || !parsedDeadline || Number.isNaN(parsedDeadline.getTime()) || parsedDeadline.toISOString().slice(0, 10) !== deadline) {
      invalid('기업·기관명(100자 이내)과 올바른 접수 마감일을 입력해 주세요.');
    }
  }
  return { board, title: title.trim(), body: body.trim(), category, secret, pinned, ...(board === 'careers' ? { company: company.trim(), deadline } : {}) };
}

export async function createApp({ dataFile = path.resolve('server/data/posts.json') } = {}) {
  const app = express();
  const sessions = new Map();
  const attempts = new Map();
  let posts;
  try { posts = JSON.parse(await readFile(dataFile, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    posts = structuredClone(seedPosts);
  }
  let saveQueue = Promise.resolve();
  async function updatePosts(update) {
    const task = saveQueue.then(async () => {
      const nextPosts = update(posts);
      await mkdir(path.dirname(dataFile), { recursive: true });
      await writeFile(`${dataFile}.tmp`, JSON.stringify(nextPosts, null, 2), 'utf8');
      await rename(`${dataFile}.tmp`, dataFile);
      posts = nextPosts;
    });
    saveQueue = task.catch(() => {});
    await task;
  }
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    let pathname;
    try { pathname = decodeURIComponent(req.path).replaceAll('\\', '/').toLowerCase(); }
    catch { return res.status(400).json({ message: '올바르지 않은 경로입니다.' }); }
    if (/(^|\/)server(\/|$)/.test(pathname)) {
      return res.status(403).json({ message: '서버 파일에 접근할 수 없습니다.' });
    }
    next();
  });
  app.use('/api', express.json({ limit: '40kb' }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    // Reject cross-origin writes, including cross-origin credentialed requests.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      if (origin && origin !== `${req.protocol}://${req.get('host')}`) {
        return res.status(403).json({ message: '허용되지 않은 요청입니다.' });
      }
    }
    const token = req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith('cnu_session='))?.slice(12);
    const session = token && sessions.get(token);
    if (session && session.expires > Date.now()) {
      req.user = session.user;
      req.sessionToken = token;
    } else if (token) sessions.delete(token);
    next();
  });
  app.get('/api/session', (req, res) => res.json({ user: req.user || null }));
  app.post('/api/login', (req, res) => {
    const { studentId, password } = req.body || {};
    if (typeof studentId !== 'string' || typeof password !== 'string' || password.length > 128) {
      return res.status(400).json({ message: '학번과 비밀번호를 확인해 주세요.' });
    }
    const key = req.ip;
    const attempt = attempts.get(key);
    if (attempt?.count >= 10 && attempt.until > Date.now()) {
      return res.status(429).json({ message: '로그인 시도가 많습니다. 1분 후 다시 시도해 주세요.' });
    }
    const account = accounts.find(a => a.id === studentId.trim());
    const hash = scryptSync(password, account?.salt || accounts[0].salt, 64);
    if (!account || !timingSafeEqual(hash, account.hash)) {
      attempts.set(key, { count: (attempt?.until > Date.now() ? attempt.count : 0) + 1, until: Date.now() + 60_000 });
      return res.status(401).json({ message: '학번 또는 비밀번호가 올바르지 않습니다.' });
    }
    attempts.delete(key);
    if (req.sessionToken) sessions.delete(req.sessionToken);
    const token = randomBytes(32).toString('hex');
    const user = publicUser(account);
    sessions.set(token, { user, expires: Date.now() + 8 * 60 * 60 * 1000 });
    res.cookie('cnu_session', token, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: 8 * 60 * 60 * 1000, path: '/' });
    res.json({ user });
  });
  app.post('/api/logout', (req, res) => {
    if (req.sessionToken) sessions.delete(req.sessionToken);
    res.clearCookie('cnu_session', { path: '/', sameSite: 'strict', httpOnly: true });
    res.json({ ok: true });
  });
  app.get('/api/posts', (req, res) => {
    // Lists NEVER include bodies, including secret bodies for students and guests.
    const list = [...posts].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.date.localeCompare(a.date));
    res.json({ posts: list.map(({ body, ...post }) => post) });
  });
  app.get('/api/posts/:id', (req, res) => {
    const post = posts.find(p => p.id === req.params.id);
    if (!post) return res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
    if (post.secret && req.user?.role !== 'admin') return res.status(403).json({ message: '비밀글은 관리자만 읽을 수 있습니다.' });
    res.json({ post });
  });
  app.post('/api/posts', async (req, res, next) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ message: '관리자만 게시글을 작성할 수 있습니다.' });
    try {
      const fields = validatePostInput(req.body || {});
      const post = { ...fields, id: `${fields.board === 'careers' ? 'j' : 'n'}${Date.now()}-${randomBytes(4).toString('hex')}`, date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) };
      // Serialize both reading and writing to avoid dropping simultaneous posts.
      await updatePosts(current => [post, ...current]);
      res.status(201).json({ post });
    } catch (error) { next(error); }
  });
  app.patch('/api/posts/:id', async (req, res, next) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ message: '관리자만 게시글을 수정할 수 있습니다.' });
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).json({ message: '수정할 내용을 올바르게 입력해 주세요.' });
    try {
      let updated;
      await updatePosts(current => {
        const original = current.find(post => post.id === req.params.id);
        if (!original) throw Object.assign(new Error('게시글을 찾을 수 없습니다.'), { status: 404 });
        if (Object.hasOwn(req.body, 'board') && req.body.board !== original.board) throw Object.assign(new Error('게시판 종류는 변경할 수 없습니다.'), { status: 400 });
        const changes = Object.fromEntries(['title', 'body', 'category', 'secret', 'pinned', 'company', 'deadline'].filter(key => Object.hasOwn(req.body, key)).map(key => [key, req.body[key]]));
        updated = { ...original, ...validatePostInput({ ...original, ...changes }) };
        return current.map(post => post.id === original.id ? updated : post);
      });
      res.json({ post: updated });
    } catch (error) { next(error); }
  });
  app.delete('/api/posts/:id', async (req, res, next) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ message: '관리자만 게시글을 삭제할 수 있습니다.' });
    if (!posts.some(post => post.id === req.params.id)) return res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
    try {
      await updatePosts(current => current.filter(post => post.id !== req.params.id));
      res.json({ ok: true });
    } catch (error) { next(error); }
  });
  app.use('/api', (_req, res) => res.status(404).json({ message: '요청한 API를 찾을 수 없습니다.' }));
  app.use((error, _req, res, _next) => {
    if (!error.status || error.status >= 500) console.error(error.message);
    res.status(error.status || 500).json({ message: error.type === 'entity.parse.failed' ? '올바른 요청 형식이 아닙니다.' : error.status && error.status < 500 ? error.message : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  });
  return app;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from './app.mjs';

async function fixture(t, dataFile) {
  const directory = dataFile ? null : await mkdtemp(path.join(os.tmpdir(), 'cnu-ai-test-'));
  dataFile ||= path.join(directory, 'posts.json');
  const app = await createApp({ dataFile });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, options = {}) => fetch(`${base}${url}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  async function login(studentId, password) {
    const response = await request('/api/login', { method: 'POST', body: JSON.stringify({ studentId, password }) });
    assert.equal(response.status, 200);
    return { cookie: response.headers.get('set-cookie').split(';')[0], user: (await response.json()).user, response };
  }
  return { request, login, dataFile };
}

test('사전 등록된 두 계정 인증과 안전한 세션 쿠키', async t => {
  const { login, request } = await fixture(t);
  for (const [id, password, role] of [['261234', 'admin', 'admin'], ['262626', 'test', 'student']]) {
    const { cookie, user, response } = await login(id, password);
    assert.equal(user.role, role);
    assert.equal(user.id, id);
    assert.equal(user.password, undefined);
    assert.match(response.headers.get('set-cookie'), /HttpOnly/);
    assert.match(response.headers.get('set-cookie'), /SameSite=Strict/);
    assert.equal((await (await request('/api/session', { headers: { cookie } })).json()).user.id, id);
  }
});

test('틀린 계정과 비밀번호는 인증 실패', async t => {
  const { request } = await fixture(t);
  for (const [studentId, password] of [['261234', 'wrong'], ['000000', 'admin']]) {
    const response = await request('/api/login', { method: 'POST', body: JSON.stringify({ studentId, password }) });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('set-cookie'), null);
  }
});

test('비밀글 본문은 목록에 없으며 학생과 방문자의 직접 접근 차단', async t => {
  const { request, login } = await fixture(t);
  const student = await login('262626', 'test');
  for (const headers of [{}, { cookie: student.cookie }]) {
    const response = await request('/api/posts', { headers });
    const { posts } = await response.json();
    const secret = posts.find(p => p.secret);
    assert.ok(secret.title);
    assert.equal(secret.body, undefined);
    assert.equal(posts.some(p => 'body' in p), false);
    const detail = await request(`/api/posts/${secret.id}`, { headers });
    assert.equal(detail.status, 403);
    assert.equal((await detail.json()).post, undefined);
  }
});

test('관리자만 비밀글 본문 열람 가능', async t => {
  const { request, login } = await fixture(t);
  const admin = await login('261234', 'admin');
  const response = await request('/api/posts/n105', { headers: { cookie: admin.cookie } });
  assert.equal(response.status, 200);
  assert.match((await response.json()).post.body, /관리자 전용/);
});

test('학생과 방문자는 공지·채용 작성 API 직접 호출도 불가', async t => {
  const { request, login } = await fixture(t);
  const student = await login('262626', 'test');
  for (const headers of [{}, { cookie: student.cookie }]) {
    for (const board of ['notices', 'careers']) {
      const response = await request('/api/posts', { method: 'POST', headers, body: JSON.stringify({ board, title: '무단 작성', body: '차단되어야 합니다.' }) });
      assert.equal(response.status, 403);
    }
  }
});

test('채용정보는 예시 게시글 없이 빈 게시판으로 시작', async t => {
  const { request } = await fixture(t);
  const { posts } = await (await request('/api/posts')).json();
  assert.equal(posts.filter(post => post.board === 'careers').length, 0);
  assert.ok(posts.some(post => post.board === 'notices'));
  assert.equal((await request('/api/posts/j101')).status, 404);
});

test('관리자 채용 등록·저장 후 학생과 방문자가 본문 열람 가능', async t => {
  const { request, login, dataFile } = await fixture(t);
  const { cookie } = await login('261234', 'admin');
  const payload = { board: 'careers', title: 'AI 엔지니어 채용', body: '지원 방법과 자격 요건', category: '신입', company: '테스트 기업', deadline: '2026-12-31' };
  const response = await request('/api/posts', { method: 'POST', headers: { cookie }, body: JSON.stringify(payload) });
  assert.equal(response.status, 201);
  const { post } = await response.json();
  assert.equal(post.board, 'careers');
  assert.equal(post.secret, false);
  assert.equal(post.company, payload.company);
  assert.equal(post.deadline, payload.deadline);
  const student = await login('262626', 'test');
  for (const headers of [{}, { cookie: student.cookie }]) {
    const detail = await request(`/api/posts/${post.id}`, { headers });
    assert.equal(detail.status, 200);
    assert.equal((await detail.json()).post.body, payload.body);
    const { posts } = await (await request('/api/posts', { headers })).json();
    assert.equal(posts.find(p => p.id === post.id).title, payload.title);
  }
  const restarted = await fixture(t, dataFile);
  assert.equal((await (await restarted.request(`/api/posts/${post.id}`)).json()).post.body, payload.body);
});

test('채용정보에는 비밀글을 설정할 수 없고 잘못된 채용 입력은 거부', async t => {
  const { request, login } = await fixture(t);
  const { cookie } = await login('261234', 'admin');
  const payload = { board: 'careers', title: '채용정보', body: '공개 본문', category: '인턴', company: '테스트 기업', deadline: '2026-12-31' };
  for (const invalid of [{ secret: true }, { secret: 'true' }, { company: '' }, { deadline: '2026-02-30' }, { deadline: 'invalid' }, { category: '학과' }, { board: 'unknown' }, { board: ['careers'] }]) {
    assert.equal((await request('/api/posts', { method: 'POST', headers: { cookie }, body: JSON.stringify({ ...payload, ...invalid }) })).status, 400);
  }
  const { posts } = await (await request('/api/posts')).json();
  assert.equal(posts.some(post => post.board === 'careers'), false);
});

test('학생과 방문자는 공지·채용 삭제 API에 접근 불가', async t => {
  const { request, login } = await fixture(t);
  const admin = await login('261234', 'admin');
  const created = await request('/api/posts', { method: 'POST', headers: { cookie: admin.cookie }, body: JSON.stringify({ board: 'careers', title: '채용 공고', body: '공개 본문', company: '테스트 기업', deadline: '2026-12-31' }) });
  const { post } = await created.json();
  const student = await login('262626', 'test');
  for (const headers of [{}, { cookie: student.cookie }]) {
    for (const id of ['n101', post.id]) {
      assert.equal((await request(`/api/posts/${id}`, { method: 'DELETE', headers })).status, 403);
      assert.equal((await request(`/api/posts/${id}`)).status, 200);
    }
  }
});

test('관리자가 일반·비밀 공지와 채용정보 삭제 후 재시작해도 복원되지 않음', async t => {
  const { request, login, dataFile } = await fixture(t);
  const { cookie } = await login('261234', 'admin');
  const created = await request('/api/posts', { method: 'POST', headers: { cookie }, body: JSON.stringify({ board: 'careers', title: '삭제할 채용 공고', body: '공개 본문', company: '테스트 기업', deadline: '2026-12-31' }) });
  const { post } = await created.json();
  for (const id of ['n101', 'n105', post.id]) {
    assert.equal((await request(`/api/posts/${id}`, { method: 'DELETE', headers: { cookie } })).status, 200);
    assert.equal((await request(`/api/posts/${id}`)).status, 404);
    assert.equal((await request(`/api/posts/${id}`, { method: 'DELETE', headers: { cookie } })).status, 404);
  }
  const { posts } = await (await request('/api/posts')).json();
  assert.equal(posts.some(p => ['n101', 'n105', post.id].includes(p.id)), false);
  assert.ok(posts.some(p => p.id === 'n102'));
  const restarted = await fixture(t, dataFile);
  const restored = await (await restarted.request('/api/posts')).json();
  assert.equal(restored.posts.some(p => ['n101', 'n105', post.id].includes(p.id)), false);
});

test('동시 삭제와 작성 시 삭제 글은 사라지고 새 글은 유지', async t => {
  const { request, login } = await fixture(t);
  const { cookie } = await login('261234', 'admin');
  const [deleted, created] = await Promise.all([
    request('/api/posts/n101', { method: 'DELETE', headers: { cookie } }),
    request('/api/posts', { method: 'POST', headers: { cookie }, body: JSON.stringify({ title: '삭제와 동시에 작성', body: '새 공지' }) }),
  ]);
  assert.equal(deleted.status, 200);
  assert.equal(created.status, 201);
  const { post } = await created.json();
  const { posts } = await (await request('/api/posts')).json();
  assert.equal(posts.some(p => p.id === 'n101'), false);
  assert.ok(posts.some(p => p.id === post.id));
});

test('관리자 공지 수정·비밀글 전환과 주소·등록일 보존', async t => {
  const { request, login, dataFile } = await fixture(t);
  const { cookie } = await login('261234', 'admin');
  const original = (await (await request('/api/posts/n101')).json()).post;
  const response = await request('/api/posts/n101', { method: 'PATCH', headers: { cookie }, body: JSON.stringify({ title: '수정된 공지 제목', body: '수정된 비밀 본문', category: '프로그램', secret: true, pinned: false, id: 'changed-id', date: '2000-01-01' }) });
  assert.equal(response.status, 200);
  const { post } = await response.json();
  assert.equal(post.id, original.id);
  assert.equal(post.date, original.date);
  assert.equal(post.title, '수정된 공지 제목');
  assert.equal(post.body, '수정된 비밀 본문');
  assert.equal(post.category, '프로그램');
  assert.equal(post.pinned, false);
  assert.equal((await request('/api/posts/n101')).status, 403);
  const { posts } = await (await request('/api/posts')).json();
  assert.equal(posts.filter(p => p.id === original.id).length, 1);
  assert.equal(posts.find(p => p.id === original.id).title, post.title);
  assert.equal(posts.find(p => p.id === original.id).body, undefined);
  const restarted = await fixture(t, dataFile);
  const secondAdmin = await restarted.login('261234', 'admin');
  assert.equal((await (await restarted.request('/api/posts/n101', { headers: { cookie: secondAdmin.cookie } })).json()).post.body, post.body);
  assert.equal((await request('/api/posts/n101', { method: 'PATCH', headers: { cookie }, body: JSON.stringify({ secret: false, pinned: true }) })).status, 200);
  assert.equal((await request('/api/posts/n101')).status, 200);
});

test('관리자 채용 수정 후 공개 유지·정보 저장 및 잘못된 수정 차단', async t => {
  const { request, login, dataFile } = await fixture(t);
  const { cookie } = await login('261234', 'admin');
  const created = await request('/api/posts', { method: 'POST', headers: { cookie }, body: JSON.stringify({ board: 'careers', title: '기존 채용', body: '기존 본문', company: '기존 기업', deadline: '2026-12-31' }) });
  const { post: original } = await created.json();
  const response = await request(`/api/posts/${original.id}`, { method: 'PATCH', headers: { cookie }, body: JSON.stringify({ title: '수정된 채용', body: '수정된 채용 본문', category: '인턴', company: '새 기업', deadline: '2027-01-31' }) });
  assert.equal(response.status, 200);
  const { post } = await response.json();
  assert.equal(post.id, original.id);
  assert.equal(post.date, original.date);
  assert.equal(post.company, '새 기업');
  assert.equal(post.deadline, '2027-01-31');
  assert.equal(post.category, '인턴');
  assert.equal(post.secret, false);
  for (const invalid of [{ secret: true }, { deadline: '2026-02-30' }, { company: '' }, { board: 'notices' }, { title: ' ' }, { body: '' }, { category: '학과' }]) {
    assert.equal((await request(`/api/posts/${post.id}`, { method: 'PATCH', headers: { cookie }, body: JSON.stringify(invalid) })).status, 400);
  }
  const student = await login('262626', 'test');
  assert.equal((await (await request(`/api/posts/${post.id}`, { headers: { cookie: student.cookie } })).json()).post.body, post.body);
  const restarted = await fixture(t, dataFile);
  const restored = (await (await restarted.request(`/api/posts/${post.id}`)).json()).post;
  assert.deepEqual(restored, post);
});

test('학생·방문자는 공지·채용 수정 불가 및 없는 글은 404', async t => {
  const { request, login } = await fixture(t);
  const { cookie } = await login('261234', 'admin');
  const created = await request('/api/posts', { method: 'POST', headers: { cookie }, body: JSON.stringify({ board: 'careers', title: '수정 제한 채용', body: '기존 본문', company: '기존 기업', deadline: '2026-12-31' }) });
  const { post } = await created.json();
  const student = await login('262626', 'test');
  for (const headers of [{}, { cookie: student.cookie }]) {
    for (const id of ['n101', post.id]) {
      assert.equal((await request(`/api/posts/${id}`, { method: 'PATCH', headers, body: JSON.stringify({ title: '무단 수정' }) })).status, 403);
      assert.notEqual((await (await request(`/api/posts/${id}`)).json()).post.title, '무단 수정');
    }
  }
  assert.equal((await request('/api/posts/does-not-exist', { method: 'PATCH', headers: { cookie }, body: JSON.stringify({ title: '없는 글 수정' }) })).status, 404);
  for (const invalid of [{ title: '' }, { body: 'a'.repeat(10001) }, { secret: 'true' }, { board: 'careers' }]) {
    assert.equal((await request('/api/posts/n101', { method: 'PATCH', headers: { cookie }, body: JSON.stringify(invalid) })).status, 400);
  }
});

test('동시에 다른 항목을 수정해도 두 변경 모두 유지하고 삭제된 글은 수정 불가', async t => {
  const { request, login } = await fixture(t);
  const { cookie } = await login('261234', 'admin');
  const responses = await Promise.all([
    request('/api/posts/n101', { method: 'PATCH', headers: { cookie }, body: JSON.stringify({ title: '동시 수정 제목' }) }),
    request('/api/posts/n101', { method: 'PATCH', headers: { cookie }, body: JSON.stringify({ body: '동시 수정 본문' }) }),
  ]);
  assert.ok(responses.every(response => response.status === 200));
  const { post } = await (await request('/api/posts/n101')).json();
  assert.equal(post.title, '동시 수정 제목');
  assert.equal(post.body, '동시 수정 본문');
  await request('/api/posts/n101', { method: 'DELETE', headers: { cookie } });
  assert.equal((await request('/api/posts/n101', { method: 'PATCH', headers: { cookie }, body: JSON.stringify({ title: '복원 시도' }) })).status, 404);
});

test('관리자 공지 저장, 비밀글 권한, 재시작 후 글 유지', async t => {
  const { request, login, dataFile } = await fixture(t);
  const admin = await login('261234', 'admin');
  const response = await request('/api/posts', { method: 'POST', headers: { cookie: admin.cookie }, body: JSON.stringify({ title: '새 비밀 공지', body: '노출되면 안 되는 본문', secret: true, pinned: true, category: '학과' }) });
  assert.equal(response.status, 201);
  const { post } = await response.json();
  assert.equal(post.secret, true);
  assert.equal(post.board, 'notices');
  assert.match(post.date, /^\d{4}-\d{2}-\d{2}$/);
  const saved = JSON.parse(await readFile(dataFile, 'utf8'));
  assert.equal(saved.find(p => p.id === post.id).body, post.body);
  const restarted = await fixture(t, dataFile);
  const list = await (await restarted.request('/api/posts')).json();
  assert.equal(list.posts.find(p => p.id === post.id).title, post.title);
  assert.equal((await restarted.request(`/api/posts/${post.id}`)).status, 403);
});

test('동시 작성한 공지를 모두 보존하고 입력 검증', async t => {
  const { request, login } = await fixture(t);
  const { cookie } = await login('261234', 'admin');
  const responses = await Promise.all([1, 2, 3].map(i => request('/api/posts', { method: 'POST', headers: { cookie }, body: JSON.stringify({ title: `동시 공지 ${i}`, body: '본문' }) })));
  assert.ok(responses.every(r => r.status === 201));
  const { posts } = await (await request('/api/posts')).json();
  assert.equal(posts.filter(p => p.title.startsWith('동시 공지')).length, 3);
  for (const body of [{ title: ' ', body: '본문' }, { title: '제목', body: '' }, { title: '제목', body: '본문', secret: 'false' }]) {
    assert.equal((await request('/api/posts', { method: 'POST', headers: { cookie }, body: JSON.stringify(body) })).status, 400);
  }
});

test('로그아웃 즉시 세션 무효화 및 외부 출처 작성 차단', async t => {
  const { request, login } = await fixture(t);
  const { cookie } = await login('261234', 'admin');
  assert.equal((await request('/api/posts', { method: 'POST', headers: { cookie, origin: 'https://external.example' }, body: JSON.stringify({ title: '외부 요청', body: '본문' }) })).status, 403);
  assert.equal((await request('/api/logout', { method: 'POST', headers: { cookie } })).status, 200);
  assert.equal((await (await request('/api/session', { headers: { cookie } })).json()).user, null);
  assert.equal((await request('/api/posts/n105', { headers: { cookie } })).status, 403);
});

test('개발 서버에서도 저장 파일과 서버 소스의 직접 다운로드 차단', async t => {
  const { request } = await fixture(t);
  for (const url of ['/server/data/posts.json', '/server/seed.mjs?raw', '/server/app.mjs', '/server%2fdata%2fposts.json', '/@fs/C:/project/server/data/posts.json']) {
    const response = await request(url);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).post, undefined);
  }
});

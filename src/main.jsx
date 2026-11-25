import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, BookOpen, BrainCircuit, BriefcaseBusiness, Check, ChevronDown, ChevronLeft, ChevronRight, Code2, GraduationCap, House, LockKeyhole, LogIn, LogOut, Menu, Pause, PenLine, Play, Search, ShieldCheck, Sparkles, Trash2, UserRound, X } from 'lucide-react';
import { curriculum, curriculumYear, courseSummaries } from './curriculum.js';
import './styles.css';

const AppContext = createContext(null);
const useApp = () => useContext(AppContext);
const boardNames = { notices: '공지사항', careers: '채용정보' };
const categories = { notices: ['전체', '학과', '학사', '장학', '프로그램'], careers: ['전체', '신입', '인턴', '연구'] };
const majors = [
  { key: 'ai', name: '인공지능', en: 'Artificial Intelligence', icon: BrainCircuit, text: '데이터로 배우고, 지능으로 해결합니다.' },
  { key: 'software', name: '소프트웨어', en: 'Software Engineering', icon: Code2, text: '아이디어를 세상에 필요한 서비스로 만듭니다.' },
  { key: 'security', name: '정보보안', en: 'Information Security', icon: ShieldCheck, text: '안전하고 신뢰할 수 있는 디지털 세상을 만듭니다.' },
];
async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.message || '요청에 실패했습니다.'), { status: response.status });
  return data;
}
const displayTitle = post => `${post.secret ? '[비밀글] ' : ''}${post.title}`;
const formatDate = date => date.replaceAll('-', '.');
function deadlineLabel(date) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  const days = Math.round((Date.parse(date) - Date.parse(today)) / 86400000);
  return days < 0 ? '마감' : days === 0 ? '오늘 마감' : `D-${days}`;
}

function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [posts, setPosts] = useState([]);
  const [postStatus, setPostStatus] = useState('loading');
  const [loginOpen, setLoginOpen] = useState(false);
  const [toast, setToast] = useState('');
  const refreshPosts = async () => {
    try { const data = await api('/api/posts'); setPosts(data.posts); setPostStatus('ready'); }
    catch { setPostStatus('error'); }
  };
  useEffect(() => {
    api('/api/session').then(data => setUser(data.user)).catch(() => {}).finally(() => setSessionReady(true));
    refreshPosts();
  }, []);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 4000); return () => clearTimeout(timer); } }, [toast]);
  async function logout() {
    try { await api('/api/logout', { method: 'POST' }); setUser(null); setToast('로그아웃되었습니다.'); }
    catch (error) { setToast(error.message); }
  }
  return <AppContext.Provider value={{ user, setUser, sessionReady, posts, postStatus, refreshPosts, setLoginOpen, setToast, logout }}>
    {children}
    {loginOpen && <LoginDialog onClose={() => setLoginOpen(false)} />}
    {toast && <div className="toast" role="status"><Check size={18} />{toast}</div>}
  </AppContext.Provider>;
}

function Modal({ title, onClose, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector('input, button')?.focus();
    function handleKey(event) {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const elements = [...ref.current.querySelectorAll('button:not(:disabled), input, select, textarea, a[href]')];
        const first = elements[0], last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', handleKey); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <button className="icon-button modal-close" onClick={onClose} aria-label="창 닫기"><X size={22} /></button>
      {children}
    </section>
  </div>;
}

function LoginDialog({ onClose }) {
  const { setUser, setToast } = useApp();
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const data = await api('/api/login', { method: 'POST', body: JSON.stringify({ studentId, password }) });
      setUser(data.user); setToast(`${data.user.name}님, 환영합니다.`); onClose();
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  return <Modal title="학부 로그인" onClose={onClose}>
    <div className="modal-symbol"><GraduationCap size={29} /></div>
    <span className="eyebrow">WELCOME TO CNU AI</span>
    <h2>다시 만나서 반갑습니다.</h2>
    <p className="muted">학번과 비밀번호로 로그인해 주세요.</p>
    <form onSubmit={submit} className="stack-form">
      <label>학번<input name="studentId" inputMode="numeric" autoComplete="username" placeholder="학번을 입력하세요" value={studentId} onChange={e => setStudentId(e.target.value)} required maxLength={20} /></label>
      <label>비밀번호<input name="password" type="password" autoComplete="current-password" placeholder="비밀번호를 입력하세요" value={password} onChange={e => setPassword(e.target.value)} required maxLength={128} /></label>
      {error && <p role="alert" className="form-error">{error}</p>}
      <button className="button primary full" disabled={busy}>{busy ? '로그인 중…' : '로그인'}<ArrowRight size={18} /></button>
    </form>
    <div className="test-accounts"><strong>테스트 계정 안내</strong><p>계정을 누르면 입력란이 채워집니다.</p>
      <button type="button" onClick={() => { setStudentId('261234'); setPassword('admin'); setError(''); }}><span>관리자</span><code>261234 / admin</code><ArrowUpRight size={15} /></button>
      <button type="button" onClick={() => { setStudentId('262626'); setPassword('test'); setError(''); }}><span>학생</span><code>262626 / test</code><ArrowUpRight size={15} /></button>
    </div>
    <p className="login-footnote">학부 구성원 계정은 미리 등록되어 있습니다.</p>
  </Modal>;
}

function Header() {
  const { user, sessionReady, setLoginOpen, logout } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState('');
  const location = useLocation();
  useEffect(() => { setMobileOpen(false); setOpenGroup(''); }, [location.pathname]);
  const groups = [{ title: '학과소개', links: [['학과소개', '/about'], ['교육과정', '/curriculum']] }, { title: '알림마당', links: [['공지사항', '/notices'], ['채용정보', '/careers']] }];
  return <>
    <div className="utility-bar"><div className="container utility-inner">
      <span lang="en">CHONNAM NATIONAL UNIVERSITY</span>
      <span lang="ko">전남대학교</span>
    </div></div>
    <header className="site-header"><div className="container header-inner">
      <Link to="/" className="brand" aria-label="인공지능학부 홈"><span className="brand-mark"><GraduationCap size={32} strokeWidth={1.5} /></span><span><span className="brand-university">전남대학교 <i>CHONNAM NATIONAL UNIVERSITY</i></span><strong>인공지능학부</strong></span></Link>
      <nav className={`main-nav ${mobileOpen ? 'mobile-open' : ''}`} aria-label="주 메뉴">
        {groups.map(group => <div className={`nav-group ${openGroup === group.title ? 'is-open' : ''}`} key={group.title} onMouseEnter={() => { if (matchMedia('(min-width: 601px)').matches) setOpenGroup(group.title); }} onMouseLeave={() => { if (matchMedia('(min-width: 601px)').matches) setOpenGroup(''); }} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpenGroup(''); }} onKeyDown={e => { if (e.key === 'Escape') setOpenGroup(''); }}>
          <button onClick={() => setOpenGroup(matchMedia('(min-width: 601px)').matches ? group.title : openGroup === group.title ? '' : group.title)} aria-expanded={openGroup === group.title} aria-controls={`menu-${group.title}`} className={group.links.some(([, url]) => location.pathname.startsWith(url)) ? 'nav-active' : ''}>{group.title}<ChevronDown size={14} /></button>
          <div id={`menu-${group.title}`} className="nav-dropdown">{group.links.map(([name, url]) => <NavLink to={url} key={url}>{name}<ArrowUpRight size={14} /></NavLink>)}</div>
        </div>)}
      </nav>
      <div className="header-actions">{user ? <div className="user-actions"><span title={`학번 ${user.id}`}><UserRound size={16} />{user.role === 'admin' ? '관리자' : '학생'}</span><button className="icon-button" onClick={logout} aria-label="로그아웃"><LogOut size={18} /></button></div> : <button className="login-button" disabled={!sessionReady} onClick={() => setLoginOpen(true)}><UserRound size={16} />로그인</button>}
      <button className="mobile-menu-button icon-button" aria-label={mobileOpen ? '메뉴 닫기' : '메뉴 열기'} aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X /> : <Menu />}</button></div>
    </div></header>
  </>;
}

function Footer() {
  return <footer className="site-footer"><div className="container">
    <div className="footer-top"><Link to="/" className="footer-brand"><GraduationCap size={31} /><div><span>CHONNAM NATIONAL UNIVERSITY</span><strong>전남대학교 인공지능학부</strong></div></Link></div>
    <div className="footer-bottom"><div><p>광주광역시 북구 용봉로 77 · 전남대학교 AI융합대학</p><p>학부 사무실 <a href="tel:0625304206">062-530-4206</a></p></div><div className="footer-note"><p>학부 공식 홈페이지를 참고한 미니 웹사이트입니다.</p><p>게시판 초기 자료는 예시입니다.</p><span>© 2026 CNU AI. Department website demo.</span></div></div>
  </div></footer>;
}

function Reveal({ children, className = '', delay = 0 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries[0].isIntersecting) { setVisible(true); observer.disconnect(); } }, { threshold: 0.12 });
    observer.observe(ref.current); return () => observer.disconnect();
  }, []);
  return <div ref={ref} className={`reveal ${visible ? 'visible' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}

function Hero() {
  const [slide, setSlide] = useState(0);
  const [playing, setPlaying] = useState(!matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => { if (playing) { const id = setInterval(() => setSlide(s => (s + 1) % 2), 7000); return () => clearInterval(id); } }, [playing]);
  const slides = [{ top: '지능의 가능성을,', bottom: '세상의 변화로.', sub: '배움을 넘어 새로운 내일을 만드는 곳, 전남대학교 인공지능학부', image: '/images/campus-night.jpg' }, { top: '함께 배우는 오늘,', bottom: '우리가 만드는 미래.', sub: '소프트웨어 · 인공지능 · 정보보안, 더 넓은 가능성으로 연결됩니다.', image: '/images/campus.jpg' }];
  return <section className="hero" aria-roledescription="캐러셀" aria-label="학부 소개 배너">
    {slides.map((item, i) => <div key={item.top} className={`hero-slide ${slide === i ? 'active' : ''}`} style={{ backgroundImage: `url(${item.image})` }} aria-hidden={slide !== i}>
      <div className="hero-content"><span className="hero-eyebrow"><span /> SCHOOL OF ARTIFICIAL INTELLIGENCE</span><h1>{item.top}<br /><em>{item.bottom}</em></h1><p>{item.sub}</p><Link to="/about" className="hero-link" tabIndex={slide === i ? 0 : -1}>학부 이야기 만나보기<ArrowUpRight size={19} /></Link></div>
    </div>)}
    <div className="hero-side-label">THINK BEYOND. CREATE TOMORROW.</div>
    <div className="hero-bottom"><div className="slide-controls"><strong>0{slide + 1}</strong><span className="slide-track"><i className={slide === 1 ? 'second' : ''} /></span><span>02</span><button onClick={() => setSlide(s => (s + 1) % 2)} aria-label="이전 배너"><ChevronLeft size={19} /></button><button onClick={() => setPlaying(!playing)} aria-label={playing ? '배너 일시정지' : '배너 재생'}>{playing ? <Pause size={14} /> : <Play size={14} />}</button><button onClick={() => setSlide(s => (s + 1) % 2)} aria-label="다음 배너"><ChevronRight size={19} /></button></div><a href="#discover" className="scroll-cue">SCROLL TO DISCOVER<ArrowDown size={15} /></a></div>
  </section>;
}

function QuickLinks() {
  return <div className="quick-links">{[[GraduationCap, '학과소개', '우리 학부 알아보기', '/about'], [BookOpen, '교육과정', '배움의 여정 살펴보기', '/curriculum'], [Sparkles, '공지사항', '놓치지 말아야 할 소식', '/notices'], [BriefcaseBusiness, '채용정보', '새로운 기회 발견하기', '/careers']].map(([Icon, title, sub, url]) => <Link to={url} key={url}><Icon size={26} strokeWidth={1.5} /><div><strong>{title}</strong><span>{sub}</span></div><ArrowUpRight size={18} /></Link>)}</div>;
}

function BoardFeedback() {
  const { postStatus, refreshPosts } = useApp();
  return postStatus === 'error' ? <div className="empty-state"><p>소식을 불러오지 못했습니다.</p><button className="text-link" onClick={refreshPosts}>다시 시도<ArrowRight size={16} /></button></div> : <div className="empty-state" role="status">소식을 불러오는 중입니다…</div>;
}

function Home() {
  const { posts, postStatus } = useApp();
  return <>
    <div className="container home-top"><Hero /><QuickLinks />
      <div className="news-grid">
        <section className="news-panel"><div className="section-header"><div><span className="eyebrow">NOTICE</span><h2>학부의 새로운 소식</h2></div><Link to="/notices" className="more-link">공지사항 더보기<ArrowUpRight size={17} /></Link></div>
          {postStatus !== 'ready' ? <BoardFeedback /> : <div className="notice-preview">{posts.filter(p => p.board === 'notices').slice(0, 5).map(post => <Link to={`/notices/${post.id}`} key={post.id}><span className={`category-label cat-${post.category}`}>{post.category}</span><span className="post-preview-title">{displayTitle(post)}</span>{post.secret && <LockKeyhole size={13} className="muted" />}<time>{formatDate(post.date).slice(5)}</time></Link>)}</div>}
        </section>
        <section className="news-panel career-panel"><div className="section-header"><div><span className="eyebrow">CAREER</span><h2>가능성을 기회로</h2></div><Link to="/careers" className="more-link">채용정보 더보기<ArrowUpRight size={17} /></Link></div>
          {postStatus !== 'ready' ? <BoardFeedback /> : <div className="career-preview">{posts.some(p => p.board === 'careers') ? posts.filter(p => p.board === 'careers').slice(0, 3).map(post => <Link to={`/careers/${post.id}`} key={post.id}><span className="career-company-icon">{post.category === '인턴' ? <BrainCircuit size={23} /> : <Code2 size={23} />}</span><div><span>{post.company}<i>·</i>{post.category}</span><strong>{post.title}</strong></div><span className="deadline-chip">{deadlineLabel(post.deadline)}</span><ArrowUpRight size={17} /></Link>) : <div className="empty-state"><BriefcaseBusiness size={27} /><p>등록된 채용정보가 없습니다.</p></div>}</div>}
        </section>
      </div>
    </div>
    <section className="discover-section" id="discover"><div className="container">
      <Reveal><div className="section-kicker"><span>01 — OUR DEPARTMENT</span><span>더 나은 미래를 향한 배움</span></div></Reveal>
      <div className="intro-heading"><Reveal><h2>질문에서 시작해,<br /><span>가능성으로 이어지다.</span></h2></Reveal><Reveal delay={100}><p>기술을 이해하는 깊이, 세상을 바라보는 넓이.<br />인공지능학부는 탄탄한 소프트웨어 역량을 바탕으로<br className="desktop-break" /> 미래를 이끌어 갈 지능형 소프트웨어 인재를 키웁니다.</p><Link to="/about" className="text-link">학과소개 자세히 보기<ArrowUpRight size={18} /></Link></Reveal></div>
      <div className="major-grid">{majors.map((major, index) => <Reveal key={major.name} delay={index * 100}><Link className="major-card" to={`/curriculum?major=${index}`}><div className="major-card-top"><major.icon size={33} strokeWidth={1.4} /><span>0{index + 1}</span></div><span className="major-en">{major.en}</span><h3>{major.name}전공</h3><p>{major.text}</p><div className="major-card-bottom"><span>{curriculum[major.key].slice(0, 2).map(course => course.name).join(' · ')}</span><ArrowUpRight size={22} /></div></Link></Reveal>)}</div>
    </div></section>
    <section className="future-section container"><Reveal className="future-inner"><div><span className="eyebrow">YOUR NEXT CHAPTER</span><h2>당신의 내일을, 여기서 시작하세요.</h2><p>기초부터 실무까지, 나만의 가능성을 찾아가는 교육과정.</p></div><Link className="button primary" to="/curriculum">교육과정 살펴보기<ArrowUpRight size={18} /></Link><span className="future-watermark" aria-hidden="true">AI</span></Reveal></section>
  </>;
}

function PageBanner({ title, en, description, group = '학과소개' }) {
  return <section className="page-banner"><div className="container"><div className="breadcrumb"><Link to="/" aria-label="홈"><House size={14} /></Link><ChevronRight size={13} /><span>{group}</span><ChevronRight size={13} /><span>{title}</span></div><span className="eyebrow">{en}</span><h1>{title}</h1><p>{description}</p><span className="page-banner-graphic" aria-hidden="true">AI<span>+</span></span></div></section>;
}

function About() {
  return <>
    <PageBanner title="학과소개" en="ABOUT OUR DEPARTMENT" description="기술과 사람을 연결하며, 더 나은 미래를 그립니다." />
    <div className="container content-page"><div className="about-overview"><Reveal><span className="eyebrow">HELLO, CNU AI</span><h2>생각하는 기술,<br /><span className="green">함께 만드는 미래.</span></h2></Reveal><Reveal delay={100}><h3>소프트웨어를 바탕으로<br />인공지능의 가능성을 넓힙니다.</h3><p>인공지능학부는 소프트웨어, 인공지능, 정보보안 분야를 연결합니다. 기초 수학과 프로그래밍부터 기계학습, 딥러닝 등 응용 기술까지 배우며 문제 해결 역량을 기릅니다.</p><p>이론과 실습을 함께 익히고, 기술의 책임과 윤리를 고민하는 인재를 양성합니다.</p></Reveal></div>
      <Reveal><div className="about-image"><img src="/images/campus.jpg" alt="로봇과 연결 기술을 표현한 공식 학부 배너" /><div><span>SCHOOL OF ARTIFICIAL INTELLIGENCE</span><strong>더 깊이 배우고,<br />더 넓게 연결합니다.</strong></div></div></Reveal>
      <Reveal><div className="subsection-heading"><span className="eyebrow">OUR VISION</span><h2>우리가 지향하는 배움</h2></div></Reveal>
      <div className="vision-grid">{[[BookOpen, '탄탄한 전문성', '기초 이론과 실무 경험을 균형 있게 쌓습니다.'], [ShieldCheck, '책임 있는 기술', '전문가의 책임감과 윤리 의식을 기릅니다.'], [Sparkles, '유연한 도전', '변화하는 기술을 배우고 새로운 문제에 도전합니다.']].map(([Icon, title, text], i) => <Reveal delay={i * 100} key={title}><div className="vision-item"><Icon size={28} /><h3>{title}</h3><p>{text}</p></div></Reveal>)}</div>
      <Reveal><div className="career-path"><div><span className="eyebrow">AFTER GRADUATION</span><h2>배움 이후의 더 넓은 길</h2></div><p>AI 엔지니어 · 소프트웨어 개발자 · 보안 전문가 · 데이터 분석가 · 대학원 및 연구 분야</p><Link to="/careers" className="text-link">채용정보 둘러보기<ArrowUpRight size={18} /></Link></div></Reveal>
      <SourceNote />
    </div>
  </>;
}

function SourceNote() {
  return <p className="source-note">전남대학교 인공지능학부의 학부 소개를 요약했습니다.</p>;
}

const courseTypes = { 전선: '전공선택', 전필: '전공필수', 교필: '교양필수' };

function CoursePanel({ major, index }) {
  const [selected, setSelected] = useState(null);
  return <section id="curriculum-panel" role="tabpanel" aria-labelledby={`major-tab-${index}`}>
    <div className="curriculum-intro">
      <major.icon size={42} strokeWidth={1.3} />
      <div><h3>{major.name}전공</h3><p>{major.text}</p></div><span>{major.en}</span>
    </div>
    {[1, 2, 3, 4].map(year => {
      const scope = year <= 2 ? 'common' : major.key;
      return <section key={year} className="course-year" aria-label={`${year}학년 교과목`}>
        <header><h3>{year}학년</h3><span>{year <= 2 ? '학부 공통' : `${major.name}전공`}</span></header>
        <div className="course-terms">{[1, 2].map(semester => (
          <table key={semester} className="course-table">
            <caption>{semester}학기</caption>
            <thead><tr><th scope="col">교과목명 · 코드</th><th scope="col">구분</th><th scope="col">학점</th></tr></thead>
            <tbody>{curriculum[scope].filter(course => course.year === year && course.semester === semester).map(course => (
              <tr key={course.code}>
                <td><button type="button" aria-haspopup="dialog" onClick={() => setSelected(course)}>
                  <span>{course.name}</span><small>{course.code}</small>
                </button></td>
                <td>{course.type}</td><td>{course.credits}</td>
              </tr>
            ))}</tbody>
          </table>
        ))}</div>
      </section>;
    })}
    {selected && <Modal title={selected.name} onClose={() => setSelected(null)}>
      <div className="course-detail">
        <span className="eyebrow">{curriculumYear}학년도 · {selected.year <= 2 ? '학부 공통' : `${major.name}전공`}</span>
        <h2>{selected.name}</h2>
        <dl>{[
          ['교과목코드', selected.code], ['개설 시기', `${selected.year}학년 ${selected.semester}학기`],
          ['이수 구분', courseTypes[selected.type]], ['학점', selected.credits],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        <h3>과목 설명</h3><p>{courseSummaries[selected.code]}</p>
      </div>
    </Modal>}
  </section>;
}

function Curriculum() {
  const [params, setParams] = useSearchParams();
  const index = Math.min(2, Math.max(0, Number.parseInt(params.get('major'), 10) || 0));
  return <><PageBanner title="교육과정" en="CURRICULUM" description="학년과 학기별 교과목을 확인하고, 과목명을 선택해 상세 설명을 읽어 보세요." />
    <div className="container content-page">
      <div className="section-header curriculum-header"><h2>{curriculumYear}학년도 교육과정</h2></div>
      <div className="major-tabs" role="tablist" aria-label="전공 선택">{majors.map((m, i) => (
        <button key={m.key} role="tab" id={`major-tab-${i}`} aria-selected={index === i} aria-controls="curriculum-panel" onClick={() => setParams({ major: String(i) })}>
          <m.icon size={21} />{m.name}전공
        </button>
      ))}</div>
      <CoursePanel key={index} index={index} major={majors[index]} />
    </div></>;
}


function WritePost({ board, post = null, onClose, onSaved }) {
  const isCareer = board === 'careers';
  const editing = !!post;
  const { refreshPosts, setToast, setUser, setLoginOpen } = useApp();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      const payload = { board, title: data.get('title'), body: data.get('body'), category: data.get('category'), ...(isCareer ? { company: data.get('company'), deadline: data.get('deadline') } : { secret: data.get('secret') === 'on', pinned: data.get('pinned') === 'on' }) };
      const { post: saved } = await api(editing ? `/api/posts/${encodeURIComponent(post.id)}` : '/api/posts', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      await refreshPosts(); onSaved?.(saved); onClose(); setToast(editing ? '게시글이 수정되었습니다.' : isCareer ? '채용정보가 등록되었습니다.' : '공지사항이 등록되었습니다.');
      if (!editing) navigate(`/${board}/${saved.id}`);
    } catch (error) {
      setError(error.message);
      if (error.status === 403) { setUser(null); onClose(); setLoginOpen(true); }
    } finally { setBusy(false); }
  }
  return <Modal title={`${boardNames[board]} ${editing ? '수정' : '작성'}`} onClose={onClose} wide><span className="eyebrow">{isCareer ? 'ADMIN CAREER' : 'ADMIN NOTICE'}</span><h2>{editing ? '게시글을 수정하세요.' : isCareer ? '새로운 채용정보를 등록하세요.' : '새로운 소식을 전하세요.'}</h2><p className="muted">{editing ? '수정한 내용은' : '등록한 글은'} 홈과 {boardNames[board]}에 함께 표시됩니다.</p><form className="stack-form" onSubmit={submit}>
    <label>분류<select name="category" defaultValue={post?.category}>{categories[board].slice(1).map(cat => <option key={cat}>{cat}</option>)}</select></label>
    {isCareer && <><label>기업·기관명<input name="company" defaultValue={post?.company || ''} placeholder="기업 또는 기관명을 입력하세요" maxLength={100} required /></label><label>접수 마감일<input name="deadline" type="date" defaultValue={post?.deadline || ''} required /></label></>}
    <label>제목<input name="title" defaultValue={post?.title || ''} placeholder="제목을 입력하세요" maxLength={120} required /></label>
    <label>내용<textarea name="body" defaultValue={post?.body || ''} rows={8} placeholder="학부 구성원에게 전할 소식을 적어 주세요." maxLength={10000} required /></label>
    {!isCareer && <div className="write-options"><label><input type="checkbox" name="secret" defaultChecked={!!post?.secret} /><LockKeyhole size={16} />비밀글 <span>관리자만 본문 열람</span></label><label><input type="checkbox" name="pinned" defaultChecked={!!post?.pinned} />상단 고정</label></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-form-actions"><button type="button" className="button secondary" onClick={onClose} disabled={busy}>취소</button><button className="button primary" disabled={busy}>{busy ? (editing ? '저장 중…' : '등록 중…') : editing ? '수정 저장' : isCareer ? '채용정보 등록' : '공지 등록'}<PenLine size={16} /></button></div>
  </form></Modal>;
}

function Board({ board }) {
  const { posts, postStatus, user } = useApp();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') || '';
  const category = categories[board].includes(params.get('category')) ? params.get('category') : '전체';
  const page = Math.max(1, Number.parseInt(params.get('page')) || 1);
  const [input, setInput] = useState(query);
  const [writing, setWriting] = useState(false);
  useEffect(() => setInput(query), [query]);
  const matches = posts.filter(post => post.board === board && (category === '전체' || post.category === category) && `${post.title} ${post.company || ''}`.toLowerCase().includes(query.toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(matches.length / 6));
  const currentPage = Math.min(page, pageCount);
  const visible = matches.slice((currentPage - 1) * 6, currentPage * 6);
  const update = values => { const next = new URLSearchParams(params); Object.entries(values).forEach(([key, value]) => value && value !== '전체' ? next.set(key, String(value)) : next.delete(key)); setParams(next); };
  return <><PageBanner title={boardNames[board]} en={board === 'notices' ? 'DEPARTMENT NEWS' : 'OPPORTUNITIES AHEAD'} description={board === 'notices' ? '학부의 오늘, 함께 알아야 할 새로운 소식입니다.' : '배움의 다음 단계, 당신을 기다리는 기회를 살펴보세요.'} group="알림마당" />
    <div className="container content-page board-page"><div className="board-toolbar"><div className="filter-tabs" aria-label="분류 필터">{categories[board].map(cat => <button key={cat} onClick={() => update({ category: cat, page: '' })} aria-pressed={category === cat}>{cat}</button>)}</div><form className="search-form" role="search" onSubmit={e => { e.preventDefault(); update({ q: input.trim(), page: '' }); }}><label className="sr-only" htmlFor="board-search">게시글 제목 검색</label><input id="board-search" placeholder="궁금한 소식을 검색해 보세요" value={input} onChange={e => setInput(e.target.value)} /><button aria-label="검색"><Search size={19} /></button></form></div>
      <div className="board-count"><span>총 <strong>{matches.length}</strong>개의 소식 {query && <span>· “{query}” 검색 결과</span>}</span>{user?.role === 'admin' && <button className="button primary small" onClick={() => setWriting(true)}><PenLine size={16} />{board === 'careers' ? '채용정보 작성' : '공지 작성'}</button>}</div>
      {postStatus !== 'ready' ? <BoardFeedback /> : board === 'notices' ? <div className="notice-table"><div className="notice-table-head"><span>번호</span><span>분류</span><span>제목</span><span>등록일</span></div>{visible.map((post, i) => <Link to={`/notices/${post.id}`} className="notice-table-row" key={post.id}><span className={post.pinned ? 'pinned' : 'row-number'}>{post.pinned ? '공지' : matches.length - ((currentPage - 1) * 6 + i)}</span><span className="category-label">{post.category}</span><strong>{post.secret && <LockKeyhole size={14} />}{displayTitle(post)}</strong><time>{formatDate(post.date)}</time><ArrowUpRight className="row-arrow" size={17} /></Link>)}</div> : <div className="career-list">{visible.map(post => <Link to={`/careers/${post.id}`} className="career-list-card" key={post.id}><span className="career-company-icon"><BriefcaseBusiness size={25} /></span><div><span className="career-category">{post.company} · {post.category}</span><h3>{post.title}</h3><p>접수 마감 {formatDate(post.deadline)}</p></div><span className="deadline-chip">{deadlineLabel(post.deadline)}</span><ArrowUpRight size={20} /></Link>)}</div>}
      {postStatus === 'ready' && !matches.length && <div className="empty-state large"><Search size={32} /><h3>{!query && category === '전체' ? (board === 'careers' ? '등록된 채용정보가 없습니다.' : '등록된 공지사항이 없습니다.') : '검색 결과가 없습니다.'}</h3><p>{!query && category === '전체' ? '새 소식이 등록되면 이곳에 표시됩니다.' : '다른 검색어나 분류를 선택해 보세요.'}</p>{(query || category !== '전체') && <button className="text-link" onClick={() => setParams({})}>전체 소식 보기<ArrowRight size={16} /></button>}</div>}
      {postStatus === 'ready' && matches.length > 0 && <nav className="pagination" aria-label="게시판 페이지"><button aria-label="이전 페이지" disabled={currentPage === 1} onClick={() => update({ page: currentPage - 1 })}><ChevronLeft size={18} /></button>{Array.from({ length: pageCount }, (_, i) => <button key={i} aria-label={`${i + 1}페이지`} aria-current={currentPage === i + 1 ? 'page' : undefined} onClick={() => update({ page: i + 1 })}>{i + 1}</button>)}<button aria-label="다음 페이지" disabled={currentPage === pageCount} onClick={() => update({ page: currentPage + 1 })}><ChevronRight size={18} /></button></nav>}
      <p className="board-demo-note">{board === 'notices' ? '초기 게시글은 홈페이지 기능 확인을 위한 예시입니다. [비밀글] 본문은 관리자만 열람할 수 있습니다.' : '관리자가 등록한 채용정보를 확인할 수 있습니다.'}</p>
    </div>{writing && <WritePost board={board} onClose={() => setWriting(false)} />}</>;
}

function DeletePostDialog({ post, onClose }) {
  const { refreshPosts, setToast, setUser, setLoginOpen } = useApp();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function remove() {
    setBusy(true); setError('');
    try {
      await api(`/api/posts/${encodeURIComponent(post.id)}`, { method: 'DELETE' });
      await refreshPosts(); onClose(); setToast('게시글이 삭제되었습니다.'); navigate(`/${post.board}`);
    } catch (error) {
      setError(error.message);
      if (error.status === 403) { setUser(null); onClose(); setLoginOpen(true); }
    } finally { setBusy(false); }
  }
  return <Modal title="게시글 삭제 확인" onClose={onClose}><span className="eyebrow">DELETE POST</span><h2>게시글을 삭제하시겠습니까?</h2><p className="delete-post-title">{displayTitle(post)}</p><p className="muted">삭제한 글은 복구할 수 없습니다.</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-form-actions delete-actions"><button className="button secondary" onClick={onClose} disabled={busy}>취소</button><button className="button danger" onClick={remove} disabled={busy}><Trash2 size={16} />{busy ? '삭제 중…' : '삭제'}</button></div></Modal>;
}

function PostDetail({ board }) {
  const { id } = useParams();
  const { user, sessionReady, setLoginOpen } = useApp();
  const [result, setResult] = useState({ loading: true });
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!sessionReady) return;
    let active = true; setResult({ loading: true });
    api(`/api/posts/${encodeURIComponent(id)}`).then(({ post }) => { if (active) setResult(post.board === board ? { post } : { error: '게시글을 찾을 수 없습니다.', status: 404 }); }).catch(error => { if (active) setResult({ error: error.message, status: error.status }); });
    return () => { active = false; };
  }, [id, user, sessionReady, board]);
  return <><PageBanner title={boardNames[board]} en={board === 'notices' ? 'DEPARTMENT NEWS' : 'OPPORTUNITIES AHEAD'} description="학부의 소식을 자세히 확인해 보세요." group="알림마당" /><div className="container content-page detail-page">
    {result.loading ? <div className="empty-state large" role="status">게시글을 불러오는 중입니다…</div> : result.error ? <div className="empty-state large">{result.status === 403 ? <LockKeyhole size={38} /> : <Search size={38} />}<h2>{result.status === 403 ? '관리자만 열람할 수 있는 비밀글입니다.' : '게시글을 열 수 없습니다.'}</h2><p>{result.error}</p>{!user && result.status === 403 && <button className="button primary" onClick={() => setLoginOpen(true)}><LogIn size={17} />관리자 로그인</button>}</div> : <article className="post-article"><div className="post-article-heading"><span className="category-label">{result.post.category}</span>{result.post.secret && <span className="secret-chip"><LockKeyhole size={13} />관리자 전용</span>}<h1>{displayTitle(result.post)}</h1><div className="post-meta"><span>인공지능학부</span><time>{formatDate(result.post.date)}</time>{result.post.deadline && <span>접수 마감 {formatDate(result.post.deadline)}</span>}</div></div><div className="post-body">{result.post.body}</div></article>}
    <div className="detail-bottom"><Link to={`/${board}`} className="button secondary"><ArrowLeft size={16} />목록으로</Link>{user?.role === 'admin' && result.post && <div className="post-admin-actions"><button className="button secondary" onClick={() => setEditing(true)}><PenLine size={16} />게시글 수정</button><button className="button secondary delete-button" onClick={() => setDeleting(true)}><Trash2 size={16} />게시글 삭제</button></div>}</div>
  </div>{editing && result.post && user?.role === 'admin' && <WritePost board={board} post={result.post} onClose={() => setEditing(false)} onSaved={post => setResult({ post })} />}{deleting && result.post && user?.role === 'admin' && <DeletePostDialog post={result.post} onClose={() => setDeleting(false)} />}</>;
}

function Layout() {
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    const labels = { about: '학과소개', curriculum: '교육과정', notices: '공지사항', careers: '채용정보' };
    document.title = `${labels[location.pathname.split('/')[1]] || '인공지능학부'} · 전남대학교`;
  }, [location.pathname]);
  useEffect(() => { const handle = () => setScrolled(window.scrollY > 500); window.addEventListener('scroll', handle, { passive: true }); return () => window.removeEventListener('scroll', handle); }, []);
  return <><a className="skip-link" href="#main">본문 바로가기</a><Header /><main id="main"><Routes><Route path="/" element={<Home />} /><Route path="/about" element={<About />} /><Route path="/curriculum" element={<Curriculum />} /><Route path="/notices" element={<Board key="notices" board="notices" />} /><Route path="/careers" element={<Board key="careers" board="careers" />} /><Route path="/notices/:id" element={<PostDetail board="notices" />} /><Route path="/careers/:id" element={<PostDetail board="careers" />} /><Route path="*" element={<div className="container empty-state large"><h1>페이지를 찾을 수 없습니다.</h1><Link to="/" className="button primary">홈으로 돌아가기<ArrowRight size={18} /></Link></div>} /></Routes></main><Footer />{scrolled && <button className="back-to-top" onClick={() => window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })} aria-label="맨 위로"><ArrowUp size={20} /><span>TOP</span></button>}</>;
}

createRoot(document.getElementById('root')).render(<BrowserRouter><AppProvider><Layout /></AppProvider></BrowserRouter>);


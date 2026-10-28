// gradi app shell: desktop sidebar, phone bottom tab bar, pages by address (#/subjects, #/subject/<id>, #/settings),
// so the phone's back button works.
import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, requestPersistentStorage } from './lib/db.js';
import { guessSession } from './lib/grades.js';
import * as E from './lib/edit.js';
import * as store from './lib/store.js';
import { syncNow } from './lib/sync.js';
import { Icon } from './components/ui.jsx';
import Home from './components/Home.jsx';
import Subjects from './components/Subjects.jsx';
import SubjectPage from './components/SubjectPage.jsx';
import Settings from './components/Settings.jsx';
import SubjectForm from './components/SubjectForm.jsx';

const NAV = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'subjects', label: 'Subjects', icon: 'book' },
  { id: 'settings', label: 'Settings', icon: 'gear', foot: true },
];

function parseHash() {
  const [, view = '', id = null] = (window.location.hash || '').replace(/^#/, '').split('/');
  if (view === 'subject' && id) return { view: 'subject', id: decodeURIComponent(id) };
  if (view === 'subjects' || view === 'settings') return { view, id: null };
  return { view: 'home', id: null };
}

export default function App() {
  const [route, setRoute] = useState(parseHash);
  const [modal, setModal] = useState(null); // null | { mode: 'add' } | { mode: 'edit', uid }
  const subjects = useLiveQuery(async () => (await db.subjects.toArray()).sort((a, b) => a.code.localeCompare(b.code)), []);
  const curRow = useLiveQuery(() => db.meta.get('current'), []);
  const current = curRow ? { year: curRow.year, session: curRow.session } : guessSession();

  useEffect(() => {
    const on = () => { setRoute(parseHash()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    requestPersistentStorage();
    // Sync when the app opens, when it comes back to the screen, and when the connection returns (like moni).
    syncNow();
    const onVisible = () => { if (document.visibilityState === 'visible') syncNow(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', syncNow);
    return () => {
      window.removeEventListener('hashchange', on);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', syncNow);
    };
  }, []);

  const go = (view, id) => { window.location.hash = id ? `/${view}/${encodeURIComponent(id)}` : view === 'home' ? '/' : `/${view}`; };
  const open = (uid) => go('subject', uid);
  const closeModal = useCallback(() => setModal(null), []);
  const active = route.view === 'subject' ? 'subjects' : route.view;

  const saveForm = async (f) => {
    if (modal?.mode === 'edit') {
      await store.updateSubject(modal.uid, (s) => E.setDetails(s, f));
      setModal(null);
    } else {
      const s = await store.putSubject(E.newSubject(f));
      setModal(null);
      open(s.uid);
    }
  };

  let page;
  if (!subjects) page = <div className="empty">Loading…</div>;
  else if (route.view === 'subject') {
    const s = subjects.find((x) => x.uid === route.id);
    page = (
      <SubjectPage s={s}
        save={(fn) => store.updateSubject(s.uid, fn)}
        onEdit={() => setModal({ mode: 'edit', uid: s.uid })}
        onDelete={async () => { await store.deleteSubject(s.uid); go('subjects'); }}
        back={() => go('subjects')} />
    );
  } else if (route.view === 'subjects') page = <Subjects subjects={subjects} current={current} open={open} />;
  else if (route.view === 'settings') page = <Settings current={current} count={subjects.length} years={subjects.map((x) => x.year)} />;
  else page = <Home subjects={subjects} current={current} open={open} go={go} />;

  const navBtn = (n, cls) => (
    <button type="button" key={n.id} className={`${cls} ${active === n.id ? 'on' : ''}`} aria-current={active === n.id ? 'page' : undefined} onClick={() => go(n.id)}>
      <Icon name={n.icon} /><span>{n.label}</span>
    </button>
  );
  const editing = modal?.mode === 'edit' ? subjects?.find((x) => x.uid === modal.uid) : null;

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">gradi</div>
        <button type="button" className="btn primary" onClick={() => setModal({ mode: 'add' })}><Icon name="plus" />Add subject</button>
        <nav>{NAV.filter((n) => !n.foot).map((n) => navBtn(n, 'nav-i'))}</nav>
        <div className="side-foot">{NAV.filter((n) => n.foot).map((n) => navBtn(n, 'nav-i'))}</div>
      </aside>
      <main className="main">{page}</main>
      <nav className="tabbar" aria-label="Main">
        {NAV.map((n) => navBtn(n, 'tab-i'))}
        <button type="button" className="tab-i add" aria-label="Add subject" onClick={() => setModal({ mode: 'add' })}>
          <span className="circle"><Icon name="plus" /></span><span>Add</span>
        </button>
      </nav>
      {modal && (modal.mode === 'add' || editing) && (
        <SubjectForm subject={editing} current={current} years={(subjects ?? []).map((x) => x.year)} onSave={saveForm} onClose={closeModal} />
      )}
    </div>
  );
}

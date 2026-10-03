import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  ArrowUpRight,
  ArrowUp,
  BarChart3,
  ChevronRight,
  Database,
  FileSpreadsheet,
  LogOut,
  MessageSquare,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { api, streamMessage, type Dataset, type Message } from './api';
type User = { email: string; id: string };
const number = (n: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
const cleanName = (s: string) => s.replace(/\.csv$/i, '').replace(/[_-]/g, ' ');
function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <BarChart3 size={21} />
      </span>
      InsightChat<span className="ai-label">AI</span>
    </div>
  );
}
function Auth({ onLogin }: { onLogin: (u: User) => void }) {
  const [register, setRegister] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget);
    try {
      onLogin(
        await api<User>('/auth/' + (register ? 'register' : 'login'), {
          method: 'POST',
          body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <section className="auth-story">
        <Brand />
        <div>
          <span className="eyebrow">A LITTLE DATA. A LOT OF POSSIBILITY.</span>
          <h1>
            Your data has
            <br />a story.
            <br />
            <em>Let's find it.</em>
          </h1>
          <p>
            Turn a spreadsheet into a clearer picture.
            <br />
            Explore the numbers. Ask better questions.
          </p>
          <div className="story-chart">
            <span>FROM ROWS TO REVELATIONS</span>
            <div>
              {[30, 49, 42, 67, 58, 81, 74, 98].map((v, i) => (
                <i key={i} style={{ height: v + '%' }} />
              ))}
            </div>
          </div>
        </div>
        <small>Built for curious minds.</small>
      </section>
      <section className="auth-form">
        <div>
          <span className="eyebrow">YOUR PERSONAL DATA WORKSPACE</span>
          <h2>{register ? 'Make room for discovery.' : 'Welcome back.'}</h2>
          <p>
            {register
              ? 'Create an account to explore your first dataset.'
              : 'Sign in to pick up where your data left off.'}
          </p>
          <form onSubmit={submit}>
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                maxLength={254}
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                minLength={8}
                maxLength={72}
                placeholder="At least 8 characters"
                required
              />
            </label>
            {error && (
              <div role="alert" className="error">
                {error}
              </div>
            )}
            <button className="primary" disabled={busy}>
              {busy ? 'One moment…' : register ? 'Create account' : 'Sign in'}
              <ArrowUpRight size={17} />
            </button>
          </form>
          <p className="switch-auth">
            {register ? 'Already have an account?' : 'New to InsightChat?'}{' '}
            <button
              onClick={() => {
                setRegister(!register);
                setError('');
              }}
            >
              {register ? 'Sign in' : 'Create an account'}
            </button>
          </p>
          <div className="auth-note">
            <Database size={17} />
            <span>Your datasets and conversations stay in your account.</span>
          </div>
        </div>
      </section>
    </div>
  );
}
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [datasets, setDatasets] = useState<Dataset[]>([]),
    [selected, setSelected] = useState(''),
    [active, setActive] = useState<Dataset | null>(null),
    [error, setError] = useState(''),
    [uploading, setUploading] = useState(false),
    [aiEnabled, setAiEnabled] = useState(false),
    [search, setSearch] = useState(''),
    [tab, setTab] = useState('overview'),
    [deleting, setDeleting] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    api<User>('/auth/me')
      .then(setUser)
      .catch(() => {})
      .finally(() => setReady(true));
    api<{ aiEnabled: boolean }>('/health')
      .then((v) => setAiEnabled(v.aiEnabled))
      .catch(() => {});
    const expire = () => {
      setUser(null);
      setActive(null);
      setDatasets([]);
    };
    window.addEventListener('session-expired', expire);
    return () => window.removeEventListener('session-expired', expire);
  }, []);
  useEffect(() => {
    if (user)
      api<Dataset[]>('/datasets')
        .then((data) => {
          setDatasets(data);
          setSelected(data[0]?.id ?? '');
        })
        .catch((e) => setError(e.message));
  }, [user]);
  useEffect(() => {
    setActive(null);
    setConfirmDelete(false);
    if (!selected) return;
    let cancelled = false;
    api<Dataset>('/datasets/' + selected)
      .then((data) => {
        if (!cancelled) setActive(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);
  async function upload(csv: File) {
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', csv);
      const data = await api<Dataset>('/datasets', { method: 'POST', body: form });
      setDatasets((previous) => [data, ...previous]);
      setSelected(data.id);
      setTab('overview');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (file.current) file.current.value = '';
    }
  }
  async function sample() {
    const response = await fetch('/sample-sales.csv');
    await upload(new File([await response.text()], 'sample-sales.csv', { type: 'text/csv' }));
  }
  async function remove() {
    if (!active) return;
    setDeleting(true);
    try {
      await api('/datasets/' + active.id, { method: 'DELETE' });
      const remaining = datasets.filter((d) => d.id !== active.id);
      setDatasets(remaining);
      setSelected(remaining[0]?.id ?? '');
      setConfirmDelete(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }
  if (!ready)
    return (
      <div className="loading-screen">
        <Brand />
        <p>Opening your workspace…</p>
      </div>
    );
  if (!user)
    return (
      <Auth
        onLogin={(u) => {
          setError('');
          setUser(u);
        }}
      />
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">PERSONAL WORKSPACE</div>
        <button className="nav-active" onClick={() => setTab('overview')}>
          <BarChart3 size={18} />
          Overview
          <ChevronRight size={15} />
        </button>
        <div className="dataset-label">
          <span>YOUR DATASETS</span>
          <span>{datasets.length}</span>
        </div>
        <label className="search">
          <Search size={15} />
          <input
            aria-label="Find a dataset"
            placeholder="Find a dataset"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="dataset-list">
          {datasets
            .filter((d) => d.name.toLowerCase().includes(search.toLowerCase()))
            .map((d) => (
              <button
                key={d.id}
                className={selected === d.id ? 'dataset selected' : 'dataset'}
                onClick={() => {
                  setSelected(d.id);
                  setTab('overview');
                }}
              >
                <FileSpreadsheet size={17} />
                <span>
                  {cleanName(d.name)}
                  <small>{number(d.analytics.rowCount)} rows</small>
                </span>
              </button>
            ))}
          {!datasets.length && (
            <p className="sidebar-empty">
              Your next discovery
              <br />
              starts with a CSV.
            </p>
          )}
        </div>
        <button className="add-dataset" disabled={uploading} onClick={() => file.current?.click()}>
          <Plus size={16} />
          Add a dataset
        </button>
        <div className="sidebar-bottom">
          <span className="avatar">{user.email[0].toUpperCase()}</span>
          <span className="account">
            My workspace<small title={user.email}>{user.email}</small>
          </span>
          <button
            aria-label="Sign out"
            title="Sign out"
            onClick={async () => {
              try {
                await api('/auth/logout', { method: 'POST' });
                setUser(null);
                setDatasets([]);
                setActive(null);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            Workspace <ChevronRight size={13} /> <b>Overview</b>
          </span>
          <span className="private-badge">
            <i />
            Private workspace
          </span>
        </header>
        <main>
          <div className="page-title">
            <div>
              <span className="eyebrow">YOUR DATA, A LITTLE CLEARER</span>
              <h1>
                Let's connect the dots<span>.</span>
              </h1>
              <p>From raw rows to meaningful insights. Start exploring.</p>
            </div>
            <button className="primary" onClick={() => file.current?.click()} disabled={uploading}>
              <Upload size={16} />
              {uploading ? 'Analyzing…' : 'Upload CSV'}
            </button>
          </div>
          <input
            ref={file}
            type="file"
            accept=".csv,text/csv"
            className="visually-hidden"
            aria-label="Upload CSV file"
            onChange={(e) => {
              if (e.target.files?.[0]) void upload(e.target.files[0]);
            }}
          />
          {error && (
            <div role="alert" className="error dismiss">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {!selected ? (
            <section className="empty-state">
              <span className="empty-icon">
                <FileSpreadsheet size={38} />
              </span>
              <span className="eyebrow">START WITH A QUESTION</span>
              <h2>Meet your data's potential.</h2>
              <p>
                Upload a CSV to uncover patterns, compare categories,
                <br />
                and have a conversation with your numbers.
              </p>
              <button
                className="primary"
                disabled={uploading}
                onClick={() => file.current?.click()}
              >
                <Plus size={17} />
                Upload your first dataset
              </button>
              <button className="text-button" disabled={uploading} onClick={sample}>
                Or explore a sample sales dataset <ArrowUpRight size={14} />
              </button>
              <small>CSV files · Up to 2 MB · 10,000 rows · 40 columns</small>
            </section>
          ) : !active ? (
            <div className="card loading">Loading dataset…</div>
          ) : (
            <>
              <section className="dataset-heading">
                <div className="file-icon">
                  <FileSpreadsheet size={22} />
                </div>
                <div>
                  <h2>{cleanName(active.name)}</h2>
                  <p>
                    {active.name} <span>•</span> All rows analyzed
                  </p>
                </div>
                <span className="ready-badge">Ready to explore</span>
                <button
                  title="Delete dataset"
                  aria-label="Delete dataset"
                  className="icon-button"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 size={16} />
                </button>
              </section>
              <div className="tabs">
                <button
                  className={tab === 'overview' ? 'active' : ''}
                  onClick={() => setTab('overview')}
                >
                  <BarChart3 size={15} />
                  Overview
                </button>
                <button className={tab === 'data' ? 'active' : ''} onClick={() => setTab('data')}>
                  <Database size={15} />
                  Data preview
                </button>
                <span>Every number has a story.</span>
              </div>
              <div className="metric-grid">
                {[
                  {
                    label: 'Total rows',
                    value: number(active.analytics.rowCount),
                    note: 'Records in your dataset',
                    icon: '↗',
                  },
                  {
                    label: 'Columns',
                    value: number(active.analytics.columnCount),
                    note: 'Dimensions to explore',
                    icon: '▥',
                  },
                  {
                    label: 'Numeric fields',
                    value: number(active.analytics.numericColumns.length),
                    note: 'Ready for analysis',
                    icon: '#',
                  },
                  {
                    label: 'Missing values',
                    value: number(active.analytics.missingCells),
                    note: active.analytics.missingCells
                      ? 'Blank cells to review'
                      : 'Looking good. No blank cells.',
                    icon: '✓',
                  },
                ].map((m) => (
                  <article className="metric card" key={m.label}>
                    <div>
                      {m.label}
                      <span>{m.icon}</span>
                    </div>
                    <strong>{m.value}</strong>
                    <small>{m.note}</small>
                  </article>
                ))}
              </div>
              <div className="analysis-grid">
                <div className="data-column">
                  {tab === 'overview' ? (
                    <Charts key={active.id} dataset={active} />
                  ) : (
                    <DataTable dataset={active} />
                  )}
                  <section className="card statistics">
                    <div className="section-title">
                      <div>
                        <span className="eyebrow">THE DETAILS</span>
                        <h3>Column snapshot</h3>
                      </div>
                      <span>{active.analytics.columnCount} fields</span>
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Column</th>
                            <th>Type</th>
                            <th>Unique</th>
                            <th>Missing</th>
                            <th>Average</th>
                          </tr>
                        </thead>
                        <tbody>
                          {active.analytics.stats.map((s) => (
                            <tr key={s.name}>
                              <td>{s.name}</td>
                              <td>
                                <span className="type-pill">{s.type}</span>
                              </td>
                              <td>{number(s.unique)}</td>
                              <td>{s.missing}</td>
                              <td>{s.mean === undefined ? '—' : number(s.mean)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
                <Chat key={active.id} dataset={active} enabled={aiEnabled} />
              </div>
            </>
          )}
          <footer>
            <Brand />
            <span>A fresh perspective on your spreadsheets.</span>
          </footer>
        </main>
      </div>
      {confirmDelete && (
        <div className="modal-backdrop">
          <section
            className="modal card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <h2 id="delete-title">Delete this dataset?</h2>
            <p>This removes {active?.name} and its chat history permanently.</p>
            <div>
              <button onClick={() => setConfirmDelete(false)} disabled={deleting}>
                Keep dataset
              </button>
              <button className="danger" onClick={remove} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete dataset'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
function Charts({ dataset }: { dataset: Dataset }) {
  const { analytics } = dataset;
  const [group, setGroup] = useState(analytics.categoryColumns[0] ?? ''),
    [metric, setMetric] = useState(analytics.numericColumns[0] ?? ''),
    [kind, setKind] = useState('bar'),
    [chart, setChart] = useState<{
      data: { label: string; value: number }[];
      totalGroups: number;
    } | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    if (!group || !metric) return;
    let cancelled = false;
    setChart(null);
    setError('');
    api<{ data: { label: string; value: number }[]; totalGroups: number }>(
      `/datasets/${dataset.id}/chart?group=${encodeURIComponent(group)}&metric=${encodeURIComponent(metric)}`,
    )
      .then((v) => {
        if (!cancelled) setChart(v);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [group, metric, dataset.id]);
  return (
    <section className="card chart-card">
      <div className="section-title">
        <div>
          <span className="eyebrow">THE BIG PICTURE</span>
          <h3>{metric && group ? `${metric} by ${group}` : 'Explore your numbers'}</h3>
        </div>
        <div className="chart-toggle">
          <button
            aria-label="Bar chart"
            className={kind === 'bar' ? 'active' : ''}
            onClick={() => setKind('bar')}
          >
            Bars
          </button>
          <button
            aria-label="Area chart"
            className={kind === 'area' ? 'active' : ''}
            onClick={() => setKind('area')}
          >
            Area
          </button>
        </div>
      </div>
      {group && metric ? (
        <>
          <div className="chart-controls">
            <label>
              Group by
              <select value={group} onChange={(e) => setGroup(e.target.value)}>
                {analytics.categoryColumns.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Sum of
              <select value={metric} onChange={(e) => setMetric(e.target.value)}>
                {analytics.numericColumns.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          {error ? (
            <p role="alert" className="error">
              {error}
            </p>
          ) : (
            <div className="chart">
              {!chart ? (
                <p>Preparing chart…</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  {kind === 'bar' ? (
                    <BarChart data={chart.data} margin={{ top: 15, right: 8, left: 0, bottom: 8 }}>
                      <CartesianGrid vertical={false} stroke="#e9eeeb" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: '#758078' }}
                        axisLine={false}
                        tickLine={false}
                        interval={0}
                        tickFormatter={(v) => String(v).slice(0, 15)}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#758078' }}
                        axisLine={false}
                        tickLine={false}
                        width={55}
                        tickFormatter={(v) =>
                          Intl.NumberFormat('en', { notation: 'compact' }).format(v)
                        }
                      />
                      <Tooltip formatter={(v) => number(Number(v))} cursor={{ fill: '#f1f5ef' }} />
                      <Bar
                        isAnimationActive={false}
                        dataKey="value"
                        name={metric}
                        fill="#4d8069"
                        radius={[5, 5, 0, 0]}
                        maxBarSize={52}
                      />
                    </BarChart>
                  ) : (
                    <AreaChart data={chart.data}>
                      <CartesianGrid vertical={false} stroke="#e9eeeb" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} width={55} />
                      <Tooltip />
                      <Area
                        isAnimationActive={false}
                        type="linear"
                        dataKey="value"
                        name={metric}
                        stroke="#3e705c"
                        fill="#d9e9da"
                      />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              )}
            </div>
          )}
          <div className="chart-foot">
            <i />
            <span>
              Sum across all rows ·{' '}
              {chart
                ? `${Math.min(12, chart.totalGroups)} of ${chart.totalGroups} groups`
                : 'Loading'}{' '}
              · Sorted by value
            </span>
          </div>
        </>
      ) : (
        <p className="no-chart">
          Charts need at least one text column and one numeric column. You can still explore every
          field in the data preview and column snapshot.
        </p>
      )}
    </section>
  );
}
function DataTable({ dataset }: { dataset: Dataset }) {
  return (
    <section className="card">
      <div className="section-title">
        <div>
          <span className="eyebrow">BEHIND THE NUMBERS</span>
          <h3>Data preview</h3>
        </div>
        <span>First {dataset.preview?.length} rows</span>
      </div>
      <div className="table-scroll preview">
        <table>
          <thead>
            <tr>
              {dataset.columns?.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataset.preview?.map((r, i) => (
              <tr key={i}>
                {dataset.columns?.map((c) => (
                  <td key={c}>{r[c] || '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function Chat({ dataset, enabled }: { dataset: Dataset; enabled: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]),
    [question, setQuestion] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [partial, setPartial] = useState('');
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => () => abort.current?.abort(), [dataset.id]);
  useEffect(() => {
    api<Message[]>('/datasets/' + dataset.id + '/messages')
      .then(setMessages)
      .catch((e) => setError(e.message));
  }, [dataset.id]);
  useEffect(() => {
    if (messages.length) end.current?.scrollIntoView({ block: 'nearest' });
  }, [messages]);
  async function ask(e: FormEvent) {
    e.preventDefault();
    if (!question.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      setPartial('');
      abort.current = new AbortController();
      await streamMessage(
        '/datasets/' + dataset.id + '/messages',
        question,
        (delta) => setPartial((value) => value + delta),
        abort.current.signal,
      );
      setQuestion('');
      setMessages(await api<Message[]>('/datasets/' + dataset.id + '/messages'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPartial('');
      setBusy(false);
    }
  }
  const prompts = [
    'Give me a quick summary',
    dataset.analytics.categoryColumns[0] && dataset.analytics.numericColumns[0]
      ? `Which ${dataset.analytics.categoryColumns[0]} has the highest total ${dataset.analytics.numericColumns[0]}?`
      : 'Are there any missing values?',
    'What should I explore next?',
  ];
  return (
    <section className="card chat-card">
      <div className="chat-header">
        <span className="sparkle">
          <Sparkles size={19} />
        </span>
        <div>
          <h3>Ask your data</h3>
          <span>Your curious companion</span>
        </div>
        <span className="chat-dot" />
      </div>
      <div className="chat-body">
        <div className="chat-intro">
          <span className="eyebrow">GOOD QUESTIONS. CLEARER ANSWERS.</span>
          <h3>
            A little curiosity <br />
            goes a long way.
          </h3>
          <p>
            Ask about patterns, totals, or missing values in <b>{cleanName(dataset.name)}</b>.
          </p>
        </div>
        {messages.length === 0 && (
          <div className="suggestions">
            {prompts.map((p) => (
              <button key={p} onClick={() => setQuestion(p)}>
                {p}
                <ArrowUpRight size={15} />
              </button>
            ))}
          </div>
        )}
        {!enabled && (
          <div className="ai-notice">
            <Sparkles size={15} />
            <span>
              AI setup pending. Add an OpenAI API key to enable answers. Your charts are ready to
              explore.
            </span>
          </div>
        )}
        <div className="messages" aria-live="polite">
          {messages.map((m) => (
            <div className={'message ' + m.role} key={m.id}>
              <small>{m.role === 'user' ? 'YOU' : 'INSIGHTCHAT'}</small>
              <p>{m.content}</p>
            </div>
          ))}
          {busy &&
            (partial ? (
              <div className="message assistant">
                <small>INSIGHTCHAT</small>
                <p>{partial}</p>
              </div>
            ) : (
              <div className="thinking">Finding the story in your data…</div>
            ))}
          <div ref={end} />
        </div>
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
      </div>
      <form className="chat-form" onSubmit={ask}>
        <div>
          <textarea
            aria-label="Ask about your data"
            placeholder="What would you like to discover?"
            value={question}
            maxLength={1000}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button
            className="primary"
            aria-label="Send question"
            disabled={busy || !question.trim() || !enabled}
          >
            <ArrowUp size={18} />
          </button>
        </div>
        <small>
          <MessageSquare size={11} />
          Grounded in this dataset · Double-check AI answers
        </small>
        <small className="privacy-note">
          Sending a question shares relevant statistics, schema, up to 3 sample rows, and recent
          chat context with OpenAI.
        </small>
      </form>
    </section>
  );
}

import express, { type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import { pool } from './db.js';
import { config } from './config.js';
import { analyze, parseCsv, groupRows, InputError } from './analytics.js';
import { answerQuestion, streamQuestion, type Answer, type StreamAnswer } from './assistant.js';
const credentials = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z
    .string()
    .min(8)
    .max(72)
    .refine(
      (value) => Buffer.byteLength(value, 'utf8') <= 72,
      'Password must be at most 72 UTF-8 bytes',
    ),
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0 },
});
const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: config.secureCookie,
  path: '/',
};
export function createApp(
  answer: Answer = answerQuestion,
  aiEnabled = Boolean(config.apiKey),
  streamAnswer: StreamAnswer = streamQuestion,
) {
  const app = express();
  app.disable('x-powered-by');
  // Render terminates HTTPS at one reverse proxy; never trust arbitrary forwarded hops.
  if (process.env.RENDER === 'true') app.set('trust proxy', 1);
  app.use(helmet(), express.json({ limit: '16kb' }), cookieParser());
  // Same-origin requests only. SameSite cookies add a second layer of CSRF protection.
  app.use((req, res, next) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers.origin &&
      req.headers.origin !== config.origin
    )
      return res.status(403).json({ error: 'Request origin is not allowed.' });
    next();
  });
  app.get('/api/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', aiEnabled });
  });
  const authLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many sign-in attempts. Please try again later.' },
  });
  function setSession(res: Response, id: string) {
    res.cookie(
      'session',
      jwt.sign({}, config.jwtSecret, { subject: id, algorithm: 'HS256', expiresIn: '1d' }),
      { ...cookieOptions, maxAge: 86400000 },
    );
  }
  app.post('/api/auth/register', authLimit, async (req, res) => {
    const data = credentials.parse(req.body);
    const id = randomUUID();
    const hash = await bcrypt.hash(data.password, 12);
    try {
      await pool.query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)', [
        id,
        data.email,
        hash,
      ]);
    } catch (e) {
      if ((e as { code: string }).code === '23505')
        return res.status(409).json({ error: 'An account with this email already exists.' });
      throw e;
    }
    setSession(res, id);
    res.status(201).json({ id, email: data.email });
  });
  app.post('/api/auth/login', authLimit, async (req, res) => {
    const data = credentials.parse(req.body);
    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [data.email]);
    // Dummy hash avoids an obvious early-return timing difference for unknown accounts.
    const valid = await bcrypt.compare(
      data.password,
      rows[0]?.password_hash ?? '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxuIfz.zE8MIk7TIbENZwTpMQ.u',
    );
    if (!rows[0] || !valid) return res.status(401).json({ error: 'Invalid email or password.' });
    setSession(res, rows[0].id);
    res.json({ id: rows[0].id, email: rows[0].email });
  });
  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie('session', cookieOptions);
    res.sendStatus(204);
  });
  app.use('/api', (req, res, next) => {
    try {
      const payload = jwt.verify(req.cookies.session ?? '', config.jwtSecret, {
        algorithms: ['HS256'],
      });
      if (typeof payload === 'string' || !payload.sub) throw new Error();
      res.locals.userId = payload.sub;
      next();
    } catch {
      res.status(401).json({ error: 'Please sign in to continue.' });
    }
  });
  app.get('/api/auth/me', async (_req, res) => {
    const { rows } = await pool.query('SELECT id,email FROM users WHERE id=$1', [
      res.locals.userId,
    ]);
    if (!rows[0]) return res.status(401).json({ error: 'Please sign in again.' });
    res.json(rows[0]);
  });
  app.get('/api/datasets', async (_req, res) => {
    const { rows } = await pool.query(
      'SELECT id,name,analytics,created_at FROM datasets WHERE user_id=$1 ORDER BY created_at DESC',
      [res.locals.userId],
    );
    res.json(rows);
  });
  const uploadLimit = rateLimit({
    windowMs: 60000,
    limit: 20,
    keyGenerator: (_req, res) => res.locals.userId,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Please wait before uploading more files.' },
  });
  app.post('/api/datasets', uploadLimit, upload.single('file'), async (req, res) => {
    if (!req.file || !req.file.originalname.toLowerCase().endsWith('.csv'))
      throw new InputError('Choose a .csv file.');
    const { columns, rows } = parseCsv(req.file.buffer);
    const analytics = analyze(columns, rows);
    const id = randomUUID();
    const name = req.file.originalname.slice(0, 180);
    await pool.query(
      'INSERT INTO datasets(id,user_id,name,columns,rows,analytics) VALUES($1,$2,$3,$4,$5,$6)',
      [
        id,
        res.locals.userId,
        name,
        JSON.stringify(columns),
        JSON.stringify(rows),
        JSON.stringify(analytics),
      ],
    );
    res.status(201).json({ id, name, analytics });
  });
  // Every dataset route checks ownership before reading, changing, or contacting OpenAI.
  app.use('/api/datasets/:id', async (req, res, next) => {
    if (!z.uuid().safeParse(req.params.id).success)
      return res.status(404).json({ error: 'Dataset not found.' });
    const { rows } = await pool.query('SELECT * FROM datasets WHERE id=$1 AND user_id=$2', [
      req.params.id,
      res.locals.userId,
    ]);
    if (!rows[0]) return res.status(404).json({ error: 'Dataset not found.' });
    res.locals.dataset = rows[0];
    next();
  });
  app.get('/api/datasets/:id', (_req, res) => {
    const { id, name, columns, analytics, rows, created_at } = res.locals.dataset;
    res.json({ id, name, columns, analytics, preview: rows.slice(0, 100), created_at });
  });
  app.get('/api/datasets/:id/chart', (req, res) => {
    const { analytics, rows } = res.locals.dataset;
    const { group, metric } = req.query;
    if (!analytics.categoryColumns.includes(group) || !analytics.numericColumns.includes(metric))
      throw new InputError('Select a text column and a numeric column.');
    const data = groupRows(rows, group as string, metric as string);
    res.json({ data: data.slice(0, 12), totalGroups: data.length });
  });
  app.delete('/api/datasets/:id', async (_req, res) => {
    await pool.query('DELETE FROM datasets WHERE id=$1', [res.locals.dataset.id]);
    res.sendStatus(204);
  });
  app.get('/api/datasets/:id/messages', async (_req, res) => {
    const { rows } = await pool.query(
      'SELECT id,role,content,created_at FROM messages WHERE dataset_id=$1 ORDER BY id',
      [res.locals.dataset.id],
    );
    res.json(rows);
  });
  const chatLimit = rateLimit({
    windowMs: 60000,
    limit: 10,
    keyGenerator: (_req, res) => res.locals.userId,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Please wait a minute before asking more questions.' },
  });
  const busy = new Set<string>();
  const busyUsers = new Set<string>();
  app.post('/api/datasets/:id/messages', chatLimit, async (req, res) => {
    const { question } = z.object({ question: z.string().trim().min(1).max(1000) }).parse(req.body);
    if (!aiEnabled)
      return res.status(503).json({
        error:
          'AI is not configured yet. Add OPENAI_API_KEY to server/.env and restart the API. Your dashboard works without it.',
      });
    const dataset = res.locals.dataset;
    if (busy.has(dataset.id) || busyUsers.has(res.locals.userId))
      return res.status(409).json({ error: 'An answer is already being prepared. Please wait.' });
    busy.add(dataset.id);
    busyUsers.add(res.locals.userId);
    try {
      const { rows: history } = await pool.query(
        'SELECT role,content FROM (SELECT id,role,content FROM messages WHERE dataset_id=$1 ORDER BY id DESC LIMIT 8) recent ORDER BY id',
        [dataset.id],
      );
      let content: string;
      try {
        content = await answer(dataset, question, history);
      } catch {
        return res.status(502).json({
          error:
            'The AI service could not answer. Check the API key, billing, and model, then try again.',
        });
      }
      // One statement inserts both sides atomically. Failed API calls leave no partial chat turn.
      await pool.query(
        "INSERT INTO messages(dataset_id,role,content) VALUES($1,'user',$2),($1,'assistant',$3)",
        [dataset.id, question, content],
      );
      res.status(201).json({ role: 'assistant', content });
    } finally {
      busy.delete(dataset.id);
      busyUsers.delete(res.locals.userId);
    }
  });
  app.post('/api/datasets/:id/messages/stream', chatLimit, async (req, res) => {
    const { question } = z.object({ question: z.string().trim().min(1).max(1000) }).parse(req.body);
    if (!aiEnabled)
      return res
        .status(503)
        .json({ error: 'AI is not configured. Your dashboard works without it.' });
    const dataset = res.locals.dataset;
    const userId = res.locals.userId;
    if (busy.has(dataset.id) || busyUsers.has(userId))
      return res.status(409).json({ error: 'An answer is already being prepared. Please wait.' });
    busy.add(dataset.id);
    busyUsers.add(userId);
    const controller = new AbortController();
    const close = () => controller.abort();
    res.on('close', close);
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const send = async (event: string, data: unknown) => {
      if (controller.signal.aborted) throw new Error('Client disconnected');
      if (!res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)) {
        await new Promise<void>((resolve, reject) => {
          const drain = () => {
            cleanup();
            resolve();
          };
          const abort = () => {
            cleanup();
            reject(new Error('Client disconnected'));
          };
          const cleanup = () => {
            res.off('drain', drain);
            controller.signal.removeEventListener('abort', abort);
          };
          res.once('drain', drain);
          controller.signal.addEventListener('abort', abort, { once: true });
        });
      }
    };
    try {
      const { rows: history } = await pool.query(
        'SELECT role,content FROM (SELECT id,role,content FROM messages WHERE dataset_id=$1 ORDER BY id DESC LIMIT 8) recent ORDER BY id',
        [dataset.id],
      );
      res.status(200).set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
        Connection: 'keep-alive',
      });
      res.flushHeaders();
      heartbeat = setInterval(() => {
        if (!res.writableEnded) res.write(': heartbeat\n\n');
      }, 10000);
      const content = await streamAnswer(
        dataset,
        question,
        history,
        (delta) => send('delta', { delta }),
        controller.signal,
      );
      if (controller.signal.aborted) return;
      await pool.query(
        "INSERT INTO messages(dataset_id,role,content) VALUES($1,'user',$2),($1,'assistant',$3)",
        [dataset.id, question, content],
      );
      await send('done', { role: 'assistant', content });
    } catch {
      if (!controller.signal.aborted) {
        if (res.headersSent)
          await send('error', {
            error: 'The AI response was interrupted. Please try again.',
          }).catch(() => {});
        else res.status(502).json({ error: 'Unable to prepare the AI response.' });
      }
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      res.off('close', close);
      busy.delete(dataset.id);
      busyUsers.delete(userId);
      res.end();
    }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
  if (process.env.STATIC_DIR) {
    const directory = resolve(process.env.STATIC_DIR);
    app.use(express.static(directory));
    app.get('/{*path}', (_req, res) => res.sendFile(resolve(directory, 'index.html')));
  }
  app.use((_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError)
      return res.status(400).json({
        error:
          'Check your input. Use a valid email, an 8–72 byte password, or a question under 1,000 characters.',
      });
    if (err instanceof InputError) return res.status(400).json({ error: err.message });
    if (err instanceof multer.MulterError)
      return res.status(400).json({ error: 'Upload one CSV file, no larger than 2 MB.' });
    if ((err as { type?: string }).type === 'entity.parse.failed')
      return res.status(400).json({ error: 'Invalid JSON request.' });
    if ((err as { type?: string }).type === 'entity.too.large')
      return res.status(413).json({ error: 'Request is too large.' });
    console.error('Request failed:', err.name);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });
  return app;
}

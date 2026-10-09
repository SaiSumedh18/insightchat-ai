# InsightChat AI — development guide

## Setup

Prerequisites: Node.js 22.12+ (24 recommended), npm, and running Docker Desktop.

```bash
npm ci
npm run setup
docker compose up -d --build
```

`npm run setup` creates random database and JWT secrets in ignored `.env` files. Existing files are preserved. `.env.example` and `server/.env.example` explain each setting with placeholders. Never commit either real `.env` file.

## Development: readable steps

If the full Docker stack is running, free the frontend/API ports first:

```bash
docker compose stop web api
docker compose up -d db
npm run dev
```

One command runs Vite on **5177** and Express on **4300**. Express creates the small database schema at startup. Vite forwards `/api` requests to Express, so the browser uses one origin.

If you prefer separate terminals:

1. Database: `docker compose up -d db`
2. API: `npm run dev -w server`
3. Frontend: `npm run dev -w client`
4. Verification: `npm run check`

Use `localhost`, not `127.0.0.1`, in your browser because the request-origin check expects `http://localhost:5177`.

## Enable real AI answers

The key stays on the server. Do **not** place it in frontend code or any `VITE_` variable.

- **Docker:** put your key in `OPENAI_API_KEY` in the project-root `.env`, then run `docker compose up -d --force-recreate api`.
- **Local development:** put it in `OPENAI_API_KEY` in `server/.env`, then restart the API process.
- `OPENAI_MODEL` defaults to `gpt-4.1-mini`; change it if your OpenAI account requires another Responses API model.
- API billing is separate from a ChatGPT subscription. The account needs access and available API credit.
- Once enabled, `npm run verify:ai` makes one real, small request against a three-row test dataset, checks the expected answer, checks stored history, and removes its temporary account. It requires the local database credentials in `server/.env` to match the running database.

The integration uses the official [OpenAI JavaScript quickstart](https://developers.openai.com/api/docs/quickstart) and Responses API with `store: false`. Asking a question sends column statistics, limited grouped totals, the first eight sample rows, and recent chat history to OpenAI. The UI explains this before sending. The application still stores chat history locally in PostgreSQL. `store: false` is not a claim of zero provider retention.

## How the project works

```text
React interface → Express API → PostgreSQL
                       ↓
                 OpenAI Responses API
```

| Part                       | Purpose                                                                    |
| -------------------------- | -------------------------------------------------------------------------- |
| `client/src/App.tsx`       | Login, workspace, dataset selection, charts, previews, and chat components |
| `client/src/api.ts`        | Small fetch helper and shared frontend types                               |
| `client/src/styles.css`    | Responsive desktop/mobile design                                           |
| `server/src/app.ts`        | HTTP routes, validation, authentication, ownership checks, uploads, chat   |
| `server/src/analytics.ts`  | CSV parsing, numeric summaries, and grouped sums                           |
| `server/src/assistant.ts`  | Builds bounded evidence and calls OpenAI; never executes generated code    |
| `server/src/db.ts`         | PostgreSQL connection and idempotent schema creation                       |
| `server/src/config.ts`     | Loads server environment settings                                          |
| `server/tests`             | Vitest unit tests and Supertest tests against real PostgreSQL              |
| `e2e/app.spec.ts`          | Playwright browser workflow and screenshots                                |
| `docker-compose.yml`       | Database, API, and production frontend containers                          |
| `.github/workflows/ci.yml` | Clean install, build, tests, and browser checks on push/PR                 |

### Follow one CSV through the app

1. React sends a multipart form containing the file.
2. Express checks the JWT cookie and validates the file limits.
3. `parseCsv` validates headers/rows; `analyze` computes statistics from all rows.
4. PostgreSQL stores the original cell strings and summaries as JSONB under the owner's ID.
5. React displays summaries and requests grouped sums for the chosen chart.
6. A chat request checks ownership again and sends bounded evidence to OpenAI.
7. A successful question and answer are saved together. Failed requests leave no partial turn.

### Database tables

- `users`: ID, unique email, bcrypt password hash, creation time.
- `datasets`: owner ID, filename, column names, original rows, computed analytics.
- `messages`: dataset ID, role, content, creation time. An increasing ID preserves conversation order.

Foreign keys cascade from users to datasets to messages. Queries use parameters rather than concatenating user input into SQL. This intentionally uses a small schema instead of an ORM and migration framework. Larger schema changes should introduce versioned migrations.

## Analytics rules and honest limits

- UTF-8 CSV only: at most **2 MB, 10,000 rows, 40 columns**, and 2,000 characters per cell.
- Headers must be nonempty, unique, and no longer than 100 characters. Inconsistent row lengths and malformed quotes are rejected.
- A column is numeric only when **every nonempty value** is a supported finite number with magnitude at most 10^15. Dates, currency strings, and mixed text/numbers remain text.
- Empty numeric cells are excluded from averages and add nothing to sums. Missing counts include empty cells in all columns.
- Charts show the **sum** of a numeric column grouped by a text column, across all rows. Only the top 12 groups are displayed, sorted by value. The area view is an alternate presentation of those same sorted groups, **not a chronological trend chart**.
- The assistant receives full-column statistics, plus the top 12 grouped sums for combinations of the first six text and first six numeric columns, and eight labeled sample rows. It is told to decline questions the evidence cannot answer. It cannot run arbitrary filters, SQL, or code.
- JavaScript floating-point arithmetic is suitable for a learning dashboard, not an accounting ledger. There are no forecasts, causal claims, or automatic anomaly detection.

## Authentication and safety choices

Passwords use bcrypt (12 rounds, 8–72 UTF-8 bytes). JWTs expire after one day and live in HttpOnly, SameSite=Strict cookies; they are never saved in localStorage. Mutating browser requests check their origin. Sign-in and AI requests have rate limits. Each dataset endpoint checks the user's ownership before reading or changing anything.

The project is intended for local learning. Docker ports bind only to loopback. Before public deployment, add HTTPS and secure cookies (`COOKIE_SECURE=true`), an explicit deployment origin, durable shared rate limiting, quotas, email verification/password reset, centralized session revocation, and operational monitoring. Logging out clears the browser cookie; already copied JWTs remain valid until expiry. The in-memory chat lock/rate limiter assumes one API process.

## Automated checks

Start the database first, then:

```bash
npm run check                 # TypeScript + production build + Vitest/Supertest
npx playwright install chromium
npm run test:e2e              # Browser workflow; starts local app if needed
npm audit                    # Dependency advisory check
npm run format:check         # Consistent, readable source formatting
```

Backend tests cover quoted CSVs, missing data, limits, full-row sums, authentication, invalid passwords/uploads, cross-origin requests, account isolation, chat history, upstream AI failure, unavailable AI, and deletion. The AI service is injected in tests: CI never needs an API key and these tests do not claim to verify a live model.

Browser tests create a unique test account, exercise signup, sample upload, charts, data preview, page reload, invalid CSV handling, mobile layout, deletion, and sign-out. They leave an empty test account for debugging, but delete the uploaded dataset. CI uses a disposable PostgreSQL service. For local tests, use a dedicated `DATABASE_URL` if you want all test accounts isolated from your workspace.

To test an already-running Docker stack:

```bash
E2E_EXTERNAL=1 npm run test:e2e
```

## Screenshots

The browser test generates real screenshots, not mockups:

- [Dashboard](screenshots/dashboard.png)
- [Sign-in screen](screenshots/sign-in.png)
- [Mobile layout](screenshots/mobile.png)

## GitHub

Source: [SaiSumedh18/insightchat-ai](https://github.com/SaiSumedh18/insightchat-ai). The [Test and build workflow](https://github.com/SaiSumedh18/insightchat-ai/actions/workflows/ci.yml) runs on pushes and pull requests, using a disposable PostgreSQL database and mocked OpenAI responses. No API key is required in CI. Do not add real `.env` files to Git.

## Troubleshooting

- **Docker cannot connect:** open Docker Desktop and wait for its engine to finish starting.
- **Port already in use:** stop the other app or stop this project's Docker API/web before starting local development. Keep the specified ports unchanged.
- **Database authentication fails:** the root `.env` and `server/.env` passwords must match the password used when the database volume was first created. Changing `.env` alone does not change an existing PostgreSQL role password.
- **AI setup pending:** add the key to the environment for the mode you are running, restart/recreate the API, and reload the page.
- **AI service could not answer:** check your key, API billing, model access, and network connection. The app keeps your dataset and lets you retry.
- **Text-only dataset:** the data preview and column summaries still work; category charts need both a text and a numeric column.

See [verification notes](VERIFICATION.md) for the full list of checks run during development.

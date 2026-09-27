# Verification — September 27, 2026

Project: `/Users/saisumedh/Downloads/insightchat-ai`

## Completed on this Mac

| Check                                                       | Result                         |
| ----------------------------------------------------------- | ------------------------------ |
| TypeScript compilation, client and server                   | Passed                         |
| Vite production build                                       | Passed                         |
| Vitest + Supertest                                          | 22 tests passed across 3 files |
| Browser workflow against local development servers          | Passed                         |
| Browser workflow against full Docker stack                  | Passed                         |
| Mobile width / horizontal overflow assertion                | Passed at 390 px               |
| Desktop, mobile, and sign-in screenshots                    | Captured and visually reviewed |
| PostgreSQL container                                        | Healthy; localhost:5437        |
| API container                                               | Healthy; localhost:4300        |
| Production frontend container                               | Running; localhost:5177        |
| API health endpoint through direct API and browser workflow | Passed                         |
| npm audit, including development dependencies               | 0 reported vulnerabilities     |
| Prettier formatting                                         | Passed                         |
| Real environment files ignored by Git                       | Confirmed                      |
| Local server environment file excluded from Docker image    | Confirmed                      |

## Verification scope

The browser workflow exercises registration, CSV upload, chart selection, data preview, reload persistence, invalid CSV errors, mobile layout, dataset deletion, and sign-out. Backend tests use real PostgreSQL and include isolation between two users, password validation, CSRF origin checks, upload limits, analytic calculations, chat persistence, deletion cascades, and graceful AI failures.

OpenAI adapter tests inspect the Responses API payload and simulate returned answers/errors. They confirm bounded evidence, recent history, grounding instructions, no provider-side response storage requested, and empty-answer handling.

## External verification status

- **Live OpenAI call:** passed on September 27, 2026 after the key was added to the root `.env` and the API container was recreated. `npm run verify:ai` confirmed Books as the highest-revenue category with a total of 30 and verified that both chat messages persisted. The temporary verification account and dataset were removed. AI is enabled in the running Docker app. Historical screenshots show the earlier setup-pending state.
- **GitHub Actions execution:** passed in [run 36334646208](https://github.com/SaiSumedh18/insightchat-ai/actions/runs/36334646208). GitHub verified the production build, 22 backend/adapter tests, and the browser workflow against its disposable PostgreSQL service. Source, README, screenshots, Docker configuration, and tests are published in [SaiSumedh18/insightchat-ai](https://github.com/SaiSumedh18/insightchat-ai), created as a private repository.

The Vite build emits an advisory that the chart-containing JavaScript bundle exceeds 500 kB uncompressed (about 189 kB gzipped). This does not fail the build; route-level chart splitting is a possible later optimization.

## Running state

The complete Docker stack is left running. Open http://localhost:5177 and create your own account. The root `.env` controls Docker; `server/.env` controls local development. See the README for starting, stopping, and enabling AI.

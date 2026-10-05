import 'dotenv/config';
export const config = {
  databaseUrl: process.env.DATABASE_URL ?? '',
  jwtSecret: process.env.JWT_SECRET ?? '',
  port: Number(process.env.PORT ?? 4300),
  origin: process.env.APP_ORIGIN ?? process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:5177',
  apiKey: process.env.OPENAI_API_KEY ?? '',
  model: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini',
  secureCookie: process.env.COOKIE_SECURE === 'true',
};
export function validateConfig() {
  if (!config.databaseUrl) throw new Error('DATABASE_URL is required. See server/.env.example.');
  if (config.jwtSecret.length < 32)
    throw new Error('JWT_SECRET must contain at least 32 characters.');
}

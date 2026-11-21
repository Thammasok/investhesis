export const MOCK_USER_ID = '0192f0a0-0000-7000-8000-000000000001'

export const baseEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:54322/postgres',
  PUBLIC_WEB_ORIGIN: 'http://localhost:5173',
  AUTH_MODE: 'mock',
  MOCK_USER_ID,
  MOCK_USER_EMAIL: 'investor@example.com',
  MOCK_USER_NAME: 'Test Investor',
} satisfies Record<string, string>

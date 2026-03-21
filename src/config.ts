import { createHash } from 'crypto';

export interface Config {
  apiUrl: string;
  apiToken?: string;
  email?: string;
  password?: string;
  unsafeSsl?: boolean;
  readOnly?: boolean;
  allowedProjects?: string[];
  writeRateLimit?: number; // max writes per minute
}

export function loadConfig(): Config {
  const apiUrl = process.env.LALALEAP_API_URL;
  if (!apiUrl) {
    throw new Error('LALALEAP_API_URL 環境變數未設定');
  }

  const allowedProjects = process.env.LALALEAP_ALLOWED_PROJECTS
    ? process.env.LALALEAP_ALLOWED_PROJECTS.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;

  const writeRateLimit = process.env.LALALEAP_WRITE_RATE_LIMIT
    ? parseInt(process.env.LALALEAP_WRITE_RATE_LIMIT, 10)
    : 10; // default: max 10 writes per minute

  return {
    apiUrl: apiUrl.replace(/\/$/, ''),
    apiToken: process.env.LALALEAP_API_TOKEN,
    email: process.env.LALALEAP_EMAIL,
    password: process.env.LALALEAP_PASSWORD,
    unsafeSsl: process.env.LALALEAP_UNSAFE_SSL === '1',
    readOnly: process.env.LALALEAP_READONLY === '1',
    allowedProjects,
    writeRateLimit,
  };
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

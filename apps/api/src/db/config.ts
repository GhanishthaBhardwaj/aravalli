// Database settings come from the environment (a local .env file, never from code).

export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  /** The mysql command-line client: a bare name found on PATH, or a full path. */
  mysqlBin: string;
}

type Env = Record<string, string | undefined>;

const REQUIRED = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'] as const;

export function readDbConfig(env: Env): DbConfig {
  const missing = REQUIRED.filter((k) => env[k] === undefined || (k !== 'DB_PASSWORD' && env[k] === ''));
  if (missing.length) {
    throw new Error(`Missing database settings: ${missing.join(', ')}. Copy .env.example to .env and fill it in.`);
  }
  const port = Number(env.DB_PORT ?? 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`DB_PORT must be a port number, got "${env.DB_PORT}".`);
  const database = env.DB_NAME as string;
  if (!/^[A-Za-z0-9_]+$/.test(database)) throw new Error('DB_NAME may only contain letters, digits and underscores.');
  return {
    host: env.DB_HOST as string,
    port,
    user: env.DB_USER as string,
    password: env.DB_PASSWORD as string,
    database,
    mysqlBin: env.MYSQL_BIN || 'mysql',
  };
}

/** The contents of a MySQL option file, so the password never appears on a command line. */
export function defaultsFileText(config: Pick<DbConfig, 'host' | 'port' | 'user' | 'password'>): string {
  const quote = (s: string) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  return `[client]\nhost=${quote(config.host)}\nport=${config.port}\nuser=${quote(config.user)}\npassword=${quote(config.password)}\n`;
}

/** Only databases that look disposable may be dropped by `reset`, unless the caller forces it. */
export function isDisposableDatabase(name: string): boolean {
  return /(^|_)(dev|test|local|tmp)(_|$)/i.test(name);
}

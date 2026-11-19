// Database settings come from the environment (a local .env file, never from code).
import { readFileSync } from 'node:fs';

export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  /** The mysql command-line client: a bare name found on PATH, or a full path. */
  mysqlBin: string;
  /**
   * The certificate authority (PEM text) that signed the database server's certificate. When it is set the connection uses SSL and the
   * server's certificate is checked against it (a private authority). When it is not set, nothing changes: a plain local connection.
   */
  sslCa?: string;
  /**
   * Use TLS and check the server's certificate against the trusted authorities that ship with Node (DB_SSL=true). This is what a
   * hosted database with a publicly trusted certificate (TiDB Cloud) needs: no certificate file at all.
   */
  ssl?: boolean;
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
    sslCa: readSslCa(env),
    ssl: env.DB_SSL === 'true',
  };
}

/**
 * The CA certificate for an SSL connection. Either the certificate text itself in DB_SSL_CA (what you paste into Render; a value
 * typed on one line may write its line breaks as the two characters backslash-n, which are turned back into real line breaks),
 * or DB_SSL_CA_FILE, the path of a downloaded ca.pem (handy on your own computer). Neither set: no SSL.
 */
export function readSslCa(env: Env): string | undefined {
  const file = env.DB_SSL_CA_FILE;
  const text = file ? readFileSync(file, 'utf8') : env.DB_SSL_CA;
  if (!text || !text.trim()) return undefined;
  const fixed = text.replace(/\\n/g, '\n').trim(); // a literal backslash-n becomes a real line break
  if (!fixed.includes('BEGIN CERTIFICATE')) throw new Error('DB_SSL_CA (or the file named by DB_SSL_CA_FILE) must contain a certificate: it should start with -----BEGIN CERTIFICATE-----.');
  return fixed;
}

/** How the mysql command-line client should connect over TLS: the CA file to check against, and how strictly. */
export interface CliTls { caPath: string; mode: 'VERIFY_CA' | 'VERIFY_IDENTITY' }

/** The contents of a MySQL option file, so the password never appears on a command line. */
export function defaultsFileText(config: Pick<DbConfig, 'host' | 'port' | 'user' | 'password'>, tls?: CliTls): string {
  const quote = (s: string) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  // with TLS the client checks the server's certificate (and, for a publicly trusted certificate, the host name too)
  const ssl = tls ? `ssl-mode=${tls.mode}\nssl-ca=${quote(tls.caPath.replace(/\\/g, '/'))}\n` : '';
  return `[client]\nhost=${quote(config.host)}\nport=${config.port}\nuser=${quote(config.user)}\npassword=${quote(config.password)}\n${ssl}`;
}

/** Only databases that look disposable may be dropped by `reset`, unless the caller forces it. */
export function isDisposableDatabase(name: string): boolean {
  return /(^|_)(dev|test|local|tmp)(_|$)/i.test(name);
}

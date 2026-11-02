// Database settings come from the environment (a local .env file, never from code).

const REQUIRED = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ host: string, port: number, user: string, password: string, database: string, mysqlBin: string }}
 */
export function readDbConfig(env) {
  const missing = REQUIRED.filter((k) => env[k] === undefined || (k !== 'DB_PASSWORD' && env[k] === ''));
  if (missing.length) {
    throw new Error(`Missing database settings: ${missing.join(', ')}. Copy .env.example to .env and fill it in.`);
  }
  const port = Number(env.DB_PORT ?? 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`DB_PORT must be a port number, got "${env.DB_PORT}".`);
  const database = /** @type {string} */ (env.DB_NAME);
  if (!/^[A-Za-z0-9_]+$/.test(database)) throw new Error('DB_NAME may only contain letters, digits and underscores.');
  return {
    host: /** @type {string} */ (env.DB_HOST),
    port,
    user: /** @type {string} */ (env.DB_USER),
    password: /** @type {string} */ (env.DB_PASSWORD),
    database,
    mysqlBin: env.MYSQL_BIN || 'mysql',
  };
}

/** The contents of a MySQL option file, so the password never appears on a command line. */
export function defaultsFileText(config) {
  const quote = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  return `[client]\nhost=${quote(config.host)}\nport=${config.port}\nuser=${quote(config.user)}\npassword=${quote(config.password)}\n`;
}

/** Only databases that look disposable may be dropped by `reset`, unless the caller forces it. */
export function isDisposableDatabase(name) {
  return /(^|_)(dev|test|local|tmp)(_|$)/i.test(name);
}

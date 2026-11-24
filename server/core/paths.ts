import path from 'node:path';

/**
 * Where files live. One place so the database, uploaded photos and the NLM photo set
 * can all be pointed at a persistent volume with DATA_DIR (Cloud Run: a mounted bucket or disk).
 * Defaults to ./data, which is git-ignored.
 */
export function dataPaths(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()) {
  const dataDir = path.resolve(cwd, env.DATA_DIR || 'data');
  return {
    dataDir,
    dbFile: env.DB_FILE || path.join(dataDir, 'app.db'),
    uploadDir: path.resolve(cwd, env.UPLOAD_DIR || path.join(dataDir, 'uploads')),
    nlmDir: path.join(dataDir, 'nlm'),
  };
}

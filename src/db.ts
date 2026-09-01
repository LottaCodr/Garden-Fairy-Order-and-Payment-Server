/* eslint-disable n/no-process-env */
import mongoose from 'mongoose';

// Where to set the variable when it is missing or still a placeholder.
const SET_IT_HINT =
  'Set the real connection string as an environment variable on ' +
  'your host (on Render: your service -> Environment -> MONGO_URI). ' +
  'Values set there override the placeholder in config/.env.production.';

/**
 * Validate MONGO_URI before handing it to mongoose so a missing value or
 * a leftover config-file placeholder fails fast with an actionable
 * message instead of mongoose's terse "Invalid scheme" parse error.
 */
export const assertMongoUri = (uri?: string): string => {
  const trimmed = (uri ?? '').trim();

  if (!trimmed) {
    throw new Error('MONGO_URI is not set. ' + SET_IT_HINT);
  }

  if (/^your[_-]/i.test(trimmed)) {
    throw new Error(
      `MONGO_URI is still the placeholder "${trimmed}". ` + SET_IT_HINT,
    );
  }

  if (!/^mongodb(\+srv)?:\/\//i.test(trimmed)) {
    throw new Error(
      'MONGO_URI must start with "mongodb://" or "mongodb+srv://" — ' +
        `received "${trimmed.slice(0, 30)}". ` +
        SET_IT_HINT,
    );
  }

  return trimmed;
};

export const connectDB = async () => {
  let uri: string;
  try {
    uri = assertMongoUri(process.env.MONGO_URI);
  } catch (error) {
    console.error('❌ ' + (error as Error).message);
    // eslint-disable-next-line n/no-process-exit
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(uri);
    console.log(`📦 MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    const err = error as Error;
    console.error('❌ DB Connection Failed', err);
    if (/ENOTFOUND|ESERVFAIL|ETIMEDOUT|querySrv/i.test(err.message ?? '')) {
      console.error(
        '💡 Could not reach the MongoDB host. If this is MongoDB ' +
          'Atlas, allow your host\'s outbound IPs under "Network ' +
          'Access" (for Render that usually means 0.0.0.0/0 — allow ' +
          'access from anywhere).',
      );
    }
    // eslint-disable-next-line n/no-process-exit
    process.exit(1);
  }
};

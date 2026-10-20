import 'dotenv/config';
import jwt from 'jsonwebtoken';

/**
 * Dev helper: mint a bearer token for testing the MCP/REST faces.
 *   npm run token -- <subject> <tenant>
 * Defaults to dev-user / dev-tenant. Uses the same ROKO_SHARED_SECRET the server
 * verifies with — this stands in for the future auth broker.
 */
const secret = process.env.ROKO_SHARED_SECRET;
if (!secret) {
  console.error('[roko] ROKO_SHARED_SECRET is not set (see .env.example)');
  process.exit(1);
}

const subject = process.argv[2] ?? 'dev-user';
const tenant = process.argv[3] ?? 'dev-tenant';
const token = jwt.sign({ sub: subject, tenant }, secret, { expiresIn: '30d' });

console.log(token);

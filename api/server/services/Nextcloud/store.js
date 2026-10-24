const mongoose = require('mongoose');
const { encrypt, decrypt } = require('@librechat/api');
const { getTenantId } = require('@librechat/data-schemas');

const connectionSchema = new mongoose.Schema({
  owner: { type: String, required: true },
  tenantId: { type: String, default: '' },
  server: { type: String, required: true },
  username: String,
  uid: String,
  revision: String,
  credentials: String,
  flow: String,
  flowServer: String,
  flowExpires: Date,
  pollingUntil: Date,
}, { timestamps: true });
connectionSchema.index({ owner: 1, tenantId: 1 }, { unique: true });

const proposalSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  owner: { type: String, required: true },
  tenantId: { type: String, default: '' },
  conversationId: { type: String, required: true },
  revision: { type: String, required: true },
  path: { type: String, required: true },
  mode: { type: String, enum: ['create', 'replace'], required: true },
  bytes: Number,
  payload: { type: String, required: true },
  status: { type: String, enum: ['pending', 'writing', 'saved', 'rejected', 'failed'], default: 'pending' },
  error: String,
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
proposalSchema.index({ owner: 1, tenantId: 1, conversationId: 1, status: 1 });
proposalSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Connection = mongoose.models.NextcloudConnection || mongoose.model('NextcloudConnection', connectionSchema);
const Proposal = mongoose.models.NextcloudProposal || mongoose.model('NextcloudProposal', proposalSchema);

const identitySchema = new mongoose.Schema({
  server: { type: String, required: true },
  uid: { type: String, required: true },
  tenantId: { type: String, default: '' },
  owner: { type: String, required: true },
});
identitySchema.index({ server: 1, uid: 1, tenantId: 1 }, { unique: true });
const AccountIdentity = mongoose.models.NextcloudIdentity || mongoose.model('NextcloudIdentity', identitySchema);

const loginSchema = new mongoose.Schema({
  nonce: { type: String, required: true, unique: true },
  tenantId: { type: String, default: '' },
  flow: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  pollingUntil: { type: Date, default: () => new Date(0) },
});
loginSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const LoginAttempt = mongoose.models.NextcloudLogin || mongoose.model('NextcloudLogin', loginSchema);

/** @returns {{owner: string, tenantId: string}} */
function identity(req) {
  if (!req.user?.id) throw new Error('Authenticated user required');
  return { owner: String(req.user.id), tenantId: String(req.user.tenantId ?? getTenantId() ?? '') };
}

const seal = async (value) => encrypt(JSON.stringify(value));
const unseal = async (value) => JSON.parse(await decrypt(value));

module.exports = { Connection, Proposal, AccountIdentity, LoginAttempt, identity, seal, unseal };

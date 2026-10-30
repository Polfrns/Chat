const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { SystemRoles } = require('librechat-data-provider');

/**
 * Integration test for the skills REST routes and the chat `skill_library` tool
 * against real role gates, per-skill ACLs and MongoDB. Only authentication and
 * app-config loading are injected.
 */

jest.mock('meilisearch', () => ({
  MeiliSearch: jest.fn().mockImplementation(() => ({
    getIndex: jest.fn().mockRejectedValue(new Error('mocked')),
    index: jest.fn().mockReturnValue({
      getRawInfo: jest.fn().mockResolvedValue({ primaryKey: 'id' }),
      updateSettings: jest.fn().mockResolvedValue({}),
      addDocuments: jest.fn().mockResolvedValue({}),
      updateDocuments: jest.fn().mockResolvedValue({}),
      deleteDocument: jest.fn().mockResolvedValue({}),
    }),
  })),
}));
jest.mock('~/server/middleware', () => ({
  ...jest.requireActual('~/server/middleware/accessResources'),
  requireJwtAuth: (_req, _res, next) => next(),
}));
jest.mock('~/server/middleware/config/app', () => (req, _res, next) => {
  req.config = {};
  next();
});
jest.mock('~/server/services/Skills/sync', () => ({
  maybeRunGitHubSkillSyncForRequest: jest.fn(),
}));

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  const { createModels } = require('@librechat/data-schemas');
  createModels(mongoose);
  const { seedDefaultRoles } = require('~/models');
  await seedDefaultRoles();
  const { initializeAccessRoles } = require('~/models');
  await initializeAccessRoles?.();
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

const makeUser = () => {
  const _id = new mongoose.Types.ObjectId();
  return { _id, id: _id.toString(), role: SystemRoles.USER, name: 'Test' };
};

function appFor(user) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.use('/api/skills', require('../skills'));
  return app;
}

function toolFor(user) {
  const { createSkillLibraryTool } = require('~/app/clients/tools/structured/SkillLibrary');
  const req = { user, config: {}, body: { conversationId: 'convo-1' } };
  return {
    run: async (input) => JSON.parse(await createSkillLibraryTool({ req }).invoke(input)),
  };
}

/** Answers the next popup for `user` through the REST route, as the browser would. */
async function answerPopup(user, approve) {
  const app = appFor(user);
  for (let attempt = 0; attempt < 100; attempt++) {
    const { body } = await request(app).get('/api/skills/deletion-requests').expect(200);
    if (body.requests.length) {
      await request(app)
        .post(`/api/skills/deletion-requests/${body.requests[0].requestId}/decision`)
        .send({ approve })
        .expect(200);
      return body.requests[0];
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('No deletion popup was raised');
}

describe('skills routes and skill_library tool', () => {
  const owner = makeUser();
  const stranger = makeUser();

  it('creates, reads and updates through the REST routes after the refactor', async () => {
    const app = appFor(owner);
    const created = await request(app)
      .post('/api/skills')
      .send({ name: 'rest-skill', description: 'Created over REST for the test', body: '# A' })
      .expect(201);
    await request(app).get(`/api/skills/${created.body._id}`).expect(200);
    const updated = await request(app)
      .patch(`/api/skills/${created.body._id}`)
      .send({ body: '# B', expectedVersion: created.body.version })
      .expect(200);
    expect(updated.body.body).toBe('# B');
    await request(appFor(stranger)).get(`/api/skills/${created.body._id}`).expect(403);
  });

  it('lets the chat create and edit, and deletes only after the owner approves', async () => {
    const tool = toolFor(owner);
    const { created } = await tool.run({
      operation: 'create',
      name: 'chat-skill',
      description: 'Created from a chat during the integration test',
      body: '# Steps',
    });
    const skillId = created.skill_id;
    await expect(
      tool.run({ operation: 'update', skill_id: skillId, body: '# Edited' }),
    ).resolves.toMatchObject({ updated: { skill_id: skillId } });
    await expect(tool.run({ operation: 'read', skill_id: skillId })).resolves.toMatchObject({
      body: '# Edited',
    });

    const [rejected, popup] = await Promise.all([
      tool.run({ operation: 'delete', skill_id: skillId }),
      answerPopup(owner, false),
    ]);
    expect(popup).toMatchObject({ skillId, name: 'chat-skill', conversationId: 'convo-1' });
    expect(rejected).toMatchObject({ deleted: false });
    await expect(tool.run({ operation: 'read', skill_id: skillId })).resolves.toMatchObject({
      name: 'chat-skill',
    });

    const [approved] = await Promise.all([
      tool.run({ operation: 'delete', skill_id: skillId }),
      answerPopup(owner, true),
    ]);
    expect(approved).toEqual({ deleted: true, name: 'chat-skill' });
    await expect(tool.run({ operation: 'read', skill_id: skillId })).resolves.toHaveProperty(
      'error',
    );
  });

  it("never shows another user's skill or raises a popup for it", async () => {
    const { created } = await toolFor(owner).run({
      operation: 'create',
      name: 'private-skill',
      description: 'Belongs to the owner only in this test',
      body: '# Private',
    });
    const intruder = toolFor(stranger);
    await expect(
      intruder.run({ operation: 'read', skill_id: created.skill_id }),
    ).resolves.toHaveProperty('error');
    await expect(
      intruder.run({ operation: 'delete', skill_id: created.skill_id }),
    ).resolves.toHaveProperty('error');
    const { body } = await request(appFor(stranger))
      .get('/api/skills/deletion-requests')
      .expect(200);
    expect(body.requests).toEqual([]);
    const { skills } = await intruder.run({ operation: 'list' });
    expect(skills.map((skill) => skill.name)).not.toContain('private-skill');
  });

  it('rejects a decision for a request that belongs to someone else', async () => {
    await request(appFor(stranger))
      .post('/api/skills/deletion-requests/not-theirs/decision')
      .send({ approve: true })
      .expect(404);
  });
});

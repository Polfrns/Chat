const mockDeletionRequests = {
  add: jest.fn(),
  waitForDecision: jest.fn(),
  remove: jest.fn(),
};
const mockHandlers = {
  list: jest.fn(),
  get: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

jest.mock('@librechat/api', () => ({ skillDeletionRequests: mockDeletionRequests }));
jest.mock('~/server/services/Skills/crud', () => ({
  // The real role/ACL guards are covered by the route tests; here they always pass.
  checkSkillAccess: (_req, _res, next) => next(),
  skillCrudChains: Object.fromEntries(
    Object.entries(mockHandlers).map(([operation, handler]) => [operation, [handler]]),
  ),
}));

const { createSkillLibraryTool } = require('../SkillLibrary');

const skill = {
  _id: 'skill-1',
  name: 'weekly-report',
  description: 'Formats reports',
  version: 3,
  body: '# Steps',
};
const respond = (status, body) => (_req, res) => res.status(status).json(body);
const req = { user: { id: 'user-1' }, body: { conversationId: 'convo-1' } };
const invoke = async (input) => JSON.parse(await createSkillLibraryTool({ req }).invoke(input));

beforeEach(() => {
  jest.clearAllMocks();
  mockHandlers.get.mockImplementation(respond(200, skill));
  mockDeletionRequests.add.mockResolvedValue('request-1');
});

describe('skill_library tool', () => {
  it('does not delete when the user rejects the popup', async () => {
    mockDeletionRequests.waitForDecision.mockResolvedValue('deny');
    await expect(invoke({ operation: 'delete', skill_id: 'skill-1' })).resolves.toMatchObject({
      deleted: false,
    });
    expect(mockDeletionRequests.add).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        skillId: 'skill-1',
        name: 'weekly-report',
        conversationId: 'convo-1',
      }),
    );
    expect(mockHandlers.remove).not.toHaveBeenCalled();
    expect(mockDeletionRequests.remove).toHaveBeenCalledWith('user-1', 'request-1');
  });

  it('does not delete when the confirmation times out', async () => {
    mockDeletionRequests.waitForDecision.mockResolvedValue(null);
    await expect(invoke({ operation: 'delete', skill_id: 'skill-1' })).resolves.toMatchObject({
      deleted: false,
    });
    expect(mockHandlers.remove).not.toHaveBeenCalled();
  });

  it('deletes through the route chain only after approval', async () => {
    mockDeletionRequests.waitForDecision.mockResolvedValue('approve');
    mockHandlers.remove.mockImplementation((request, res) => {
      expect(request.params).toEqual({ id: 'skill-1' });
      expect(request.user.id).toBe('user-1');
      res.status(200).json({ id: 'skill-1', deleted: true });
    });
    await expect(invoke({ operation: 'delete', skill_id: 'skill-1' })).resolves.toEqual({
      deleted: true,
      name: 'weekly-report',
    });
  });

  it('never raises a popup for a skill the user cannot see', async () => {
    mockHandlers.get.mockImplementation(respond(403, { error: 'Forbidden' }));
    await expect(invoke({ operation: 'delete', skill_id: 'other' })).resolves.toEqual({
      error: 'Forbidden',
    });
    expect(mockDeletionRequests.add).not.toHaveBeenCalled();
  });

  it('creates and updates without approval, reading the current version when absent', async () => {
    mockHandlers.create.mockImplementation((request, res) =>
      res.status(201).json({ ...skill, ...request.body, version: 1 }),
    );
    await expect(
      invoke({
        operation: 'create',
        name: 'weekly-report',
        description: 'Formats reports',
        body: '# Steps',
      }),
    ).resolves.toMatchObject({ created: { name: 'weekly-report', version: 1 } });

    mockHandlers.update.mockImplementation((request, res) => {
      expect(request.body).toEqual({ body: '# New', expectedVersion: 3 });
      res.status(200).json({ ...skill, body: '# New', version: 4 });
    });
    await expect(
      invoke({ operation: 'update', skill_id: 'skill-1', body: '# New' }),
    ).resolves.toMatchObject({ updated: { version: 4 } });
    expect(mockDeletionRequests.add).not.toHaveBeenCalled();
  });

  it('surfaces validation issues to the model', async () => {
    mockHandlers.create.mockImplementation(
      respond(400, { error: 'Validation failed', issues: [{ message: 'Name is required' }] }),
    );
    await expect(invoke({ operation: 'create', description: 'x', body: 'y' })).resolves.toEqual({
      error: 'Validation failed',
      issues: ['Name is required'],
    });
  });
});

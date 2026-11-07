jest.mock('~/models', () => ({ findFileById: jest.fn() }));
jest.mock('~/server/services/Files/strategies', () => ({ getStrategyFunctions: jest.fn() }));
jest.mock('~/server/services/Nextcloud/store', () => ({
  identity: () => ({ owner: 'alice', tenantId: 't' }),
}));
const mockService = { list: jest.fn(), read: jest.fn(), propose: jest.fn() };
jest.mock('~/server/services/Nextcloud/service', () => ({
  getNextcloudService: () => mockService,
}));
jest.mock('@librechat/api', () => {
  const actual = jest.requireActual('@librechat/api');
  return { ...actual, extractReadableText: jest.fn() };
});

const { extractReadableText, MAX_READ_BYTES, READ_PAGE_CHARS } = require('@librechat/api');
const { createNextcloudTool } = require('../Nextcloud');

const run = async (input) =>
  JSON.parse(await createNextcloudTool({ req: { body: {} } }).invoke(input));

describe('Nextcloud tool: reading', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads a document up to the 15 MB limit and returns its text in pages', async () => {
    mockService.read.mockResolvedValue({
      buffer: Buffer.from('%PDF'),
      etag: '"e1"',
      contentType: 'application/pdf',
    });
    extractReadableText.mockResolvedValue('x'.repeat(READ_PAGE_CHARS + 5));

    const first = await run({ operation: 'read', path: 'Informes/acta.pdf' });

    expect(mockService.read).toHaveBeenCalledWith(
      expect.anything(),
      'Informes/acta.pdf',
      MAX_READ_BYTES,
    );
    expect(extractReadableText).toHaveBeenCalledWith(
      expect.any(Buffer),
      'acta.pdf',
      'application/pdf',
    );
    expect(first.content).toHaveLength(READ_PAGE_CHARS);
    expect(first.next_offset).toBe(READ_PAGE_CHARS);
    expect(first.etag).toBe('"e1"');

    const second = await run({
      operation: 'read',
      path: 'Informes/acta.pdf',
      offset: first.next_offset,
    });
    expect(second.content).toHaveLength(5);
    expect(second.next_offset).toBeNull();
  });

  it('reports why a file cannot be read instead of throwing', async () => {
    mockService.read.mockResolvedValue({ buffer: Buffer.from('x'), etag: '', contentType: '' });
    extractReadableText.mockRejectedValue(
      Object.assign(new Error('This is a binary file'), { name: 'NextcloudError' }),
    );
    const result = await run({ operation: 'read', path: 'foto.png' });
    expect(result.error).toBeDefined();
  });
});

describe('Nextcloud tool: listing', () => {
  it('returns the plain list when nothing was skipped', async () => {
    mockService.list.mockResolvedValue({ entries: [{ name: 'a.txt' }], skipped: 0 });
    expect(await run({ operation: 'list' })).toEqual([{ name: 'a.txt' }]);
  });

  it('tells the model when some names could not be listed', async () => {
    mockService.list.mockResolvedValue({ entries: [{ name: 'a.txt' }], skipped: 2 });
    expect(await run({ operation: 'list' })).toEqual({
      entries: [{ name: 'a.txt' }],
      skipped_unreadable_names: 2,
    });
  });
});

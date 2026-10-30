const mockClient = {
  uploadInput: jest.fn(),
  downloadOutput: jest.fn(),
};
const mockFile = {
  file_id: 'attached-1',
  user: 'user-1',
  filename: 'report.pdf',
  filepath: '/uploads/report.pdf',
  bytes: 12,
  source: 'local',
  type: 'application/pdf',
};
const mockGetDownloadStream = jest.fn();
const mockSaveBuffer = jest.fn();
const mockCreateFile = jest.fn();
const { Readable } = require('stream');

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  readRokoWorkspaceConfig: () => ({ baseUrl: 'http://roko-workspace:8080', key: 'k'.repeat(32) }),
  RokoWorkspaceClient: jest.fn(() => mockClient),
  rokoWorkspaceIdentity: jest.fn(({ user, conversationId }) =>
    user?.id && conversationId
      ? { tenantId: 'tenant-1', userId: user.id, conversationId }
      : undefined,
  ),
}));
jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: () => ({
    getDownloadStream: mockGetDownloadStream,
    saveBuffer: mockSaveBuffer,
  }),
}));
jest.mock('~/models', () => ({
  findFileById: jest.fn(async () => mockFile),
  createFile: (...args) => mockCreateFile(...args),
}));

const { findFileById } = require('~/models');
const {
  createAttachChatFileTool,
  createDeliverWorkspaceFileTool,
} = require('../WorkspaceTransfer');

const request = {
  user: { id: 'user-1', tenantId: 'tenant-1' },
  body: {
    conversationId: 'conversation-1',
    files: [{ file_id: 'attached-1', filename: 'report.pdf' }],
  },
  config: { fileStrategy: 'local' },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDownloadStream.mockResolvedValue(Readable.from([Buffer.from('source file')]));
  mockSaveBuffer.mockResolvedValue('/uploads/output.pdf');
  mockCreateFile.mockResolvedValue({ file_id: 'generated-1', filename: 'output.pdf' });
  mockClient.uploadInput.mockResolvedValue({ path: 'inputs/report.pdf', bytes: 11 });
  mockClient.downloadOutput.mockResolvedValue({
    buffer: Buffer.from('%PDF-valid'),
    filename: 'output.pdf',
    contentType: 'application/pdf',
  });
});

describe('workspace transfer tools', () => {
  it('uploads only the attachment explicitly selected by file_id', async () => {
    const result = await createAttachChatFileTool({ req: request }).invoke({
      file_id: 'attached-1',
    });

    expect(findFileById).toHaveBeenCalledWith('attached-1');
    expect(mockClient.uploadInput).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', userId: 'user-1', conversationId: 'conversation-1' },
      'report.pdf',
      Buffer.from('source file'),
    );
    expect(result).toContain('inputs/report.pdf');
  });

  it('rejects a file_id that is not attached to the current message', async () => {
    const result = await createAttachChatFileTool({ req: request }).invoke({
      file_id: 'other-file',
    });

    expect(result).toContain('not attached to the current message');
    expect(findFileById).not.toHaveBeenCalled();
    expect(mockClient.uploadInput).not.toHaveBeenCalled();
  });

  it('creates a workspace artifact only from a validated outputs download', async () => {
    const tool = createDeliverWorkspaceFileTool({ req: request });
    const result = await tool.func({ path: 'outputs/output.pdf' });

    expect(mockClient.downloadOutput).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', userId: 'user-1', conversationId: 'conversation-1' },
      'outputs/output.pdf',
    );
    expect(mockSaveBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        buffer: Buffer.from('%PDF-valid'),
        basePath: 'uploads',
      }),
    );
    expect(mockCreateFile).toHaveBeenCalledWith(
      expect.objectContaining({
        context: 'workspace',
        filename: 'output.pdf',
        bytes: 10,
      }),
      true,
    );
    expect(result[1]).toEqual({
      workspaceFile: { file_id: 'generated-1', filename: 'output.pdf' },
    });
  });

  it('does not attach a file when no saved conversation identity exists', async () => {
    const noConversation = { ...request, body: { ...request.body, conversationId: undefined } };
    const result = await createDeliverWorkspaceFileTool({ req: noConversation }).func({
      path: 'outputs/output.pdf',
    });

    expect(result[0]).toContain('saved conversation is required');
    expect(mockClient.downloadOutput).not.toHaveBeenCalled();
    expect(mockCreateFile).not.toHaveBeenCalled();
  });

  describe('inline preview text', () => {
    const deliver = (filename, contentType, buffer) => {
      mockClient.downloadOutput.mockResolvedValue({ buffer, filename, contentType });
      return createDeliverWorkspaceFileTool({ req: request }).func({
        path: `outputs/${filename}`,
      });
    };
    const savedRecord = () => mockCreateFile.mock.calls[0][0];

    it('stores a bare MIME and the decoded text for a .txt output', async () => {
      await deliver('notes.txt', 'text/plain; charset=utf-8', Buffer.from('hola ñ'));

      expect(savedRecord()).toEqual(
        expect.objectContaining({ type: 'text/plain', text: 'hola ñ', textFormat: 'text' }),
      );
    });

    it('stores text for a .json output', async () => {
      await deliver('data.json', 'application/json', Buffer.from('{"a":1}'));

      expect(savedRecord()).toEqual(
        expect.objectContaining({ type: 'application/json', text: '{"a":1}', textFormat: 'text' }),
      );
    });

    it('truncates text between the cache cap and the extraction cap', async () => {
      await deliver('big.txt', 'text/plain', Buffer.alloc(600 * 1024, 'a'));

      const { text } = savedRecord();
      expect(text.endsWith('…[truncated]')).toBe(true);
      expect(Buffer.byteLength(text)).toBeLessThanOrEqual(512 * 1024);
    });

    it('leaves text above the extraction cap download-only', async () => {
      await deliver('huge.txt', 'text/plain', Buffer.alloc(1024 * 1024 + 1, 'a'));

      expect(savedRecord()).toEqual(expect.objectContaining({ text: null, textFormat: null }));
    });

    it('stores no text for a PNG and keeps its type', async () => {
      await deliver('chart.png', 'image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0]));

      expect(savedRecord()).toEqual(
        expect.objectContaining({ type: 'image/png', text: null, textFormat: null }),
      );
    });

    it('stores no text for an unparseable PDF and keeps its type', async () => {
      await deliver('output.pdf', 'application/pdf', Buffer.from('%PDF-valid'));

      expect(savedRecord()).toEqual(
        expect.objectContaining({ type: 'application/pdf', text: null, textFormat: null }),
      );
    });

    it('leaves office outputs download-only instead of storing unrendered text', async () => {
      await deliver('table.csv', 'text/csv', Buffer.from('a,b\n1,2'));

      expect(savedRecord()).toEqual(
        expect.objectContaining({ type: 'text/csv', text: null, textFormat: null }),
      );
    });

    it('defaults a missing content type to application/octet-stream', async () => {
      await deliver('blob', undefined, Buffer.from([0, 1, 2]));

      expect(savedRecord()).toEqual(
        expect.objectContaining({ type: 'application/octet-stream', text: null }),
      );
    });
  });
});

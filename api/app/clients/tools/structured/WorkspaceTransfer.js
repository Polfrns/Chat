const path = require('path');
const { z } = require('zod');
const { v4 } = require('uuid');
const { buffer: streamToBuffer } = require('stream/consumers');
const { tool } = require('@librechat/agents/langchain/tools');
const { FileContext } = require('librechat-data-provider');
const {
  readRokoWorkspaceConfig,
  RokoWorkspaceClient,
  rokoWorkspaceIdentity,
  classifyCodeArtifact,
  hasOfficeHtmlPath,
  extractCodeArtifactText,
  getExtractedTextFormat,
} = require('@librechat/api');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { findFileById, createFile } = require('~/models');

const UPLOAD_MAX_BYTES = 100 * 1024 * 1024;
const OUTPUT_MAX_BYTES = 15 * 1024 * 1024;

const errorText = (error) => (error instanceof Error ? error.message : String(error));

function workspaceClient() {
  const config = readRokoWorkspaceConfig();
  if (!config) {
    throw new Error('ROKO_WORKSPACE_URL is not configured.');
  }
  return new RokoWorkspaceClient(config);
}

function conversationIdentity(req) {
  return rokoWorkspaceIdentity({
    user: req.user,
    conversationId: req.body?.conversationId,
  });
}

/**
 * Inline preview text for a delivered output, from the same extractor that
 * code-execution outputs use so size caps and binary detection live in one
 * place. Office files stay download-only: their panel buckets need the
 * deferred HTML render, and plain text there would be downgraded or dropped.
 */
async function previewText(buffer, filename, mimeType) {
  if (hasOfficeHtmlPath(filename, mimeType)) {
    return { text: null, textFormat: null };
  }
  const category = classifyCodeArtifact(filename, mimeType);
  const text = await extractCodeArtifactText(buffer, filename, mimeType, category);
  return { text, textFormat: getExtractedTextFormat(filename, mimeType, text) };
}

function createAttachChatFileTool({ req }) {
  return tool(
    async ({ file_id }) => {
      const attached = (req.body?.files ?? []).some((file) => file?.file_id === file_id);
      if (!attached) {
        return 'That file is not attached to the current message.';
      }
      const identity = conversationIdentity(req);
      if (!identity) {
        return 'A saved conversation is required to use the workspace.';
      }
      const file = await findFileById(file_id);
      if (!file || String(file.user) !== String(req.user?.id)) {
        return 'The selected attachment is unavailable.';
      }
      if ((file.bytes ?? 0) > UPLOAD_MAX_BYTES) {
        return `"${file.filename}" exceeds the 100 MiB transfer limit.`;
      }
      const { getDownloadStream } = getStrategyFunctions(file.source);
      if (!getDownloadStream) {
        return `Files stored via "${file.source}" cannot be transferred.`;
      }
      try {
        const stream = await getDownloadStream(req, file.filepath);
        const buffer = await streamToBuffer(stream);
        if (buffer.length > UPLOAD_MAX_BYTES) {
          return `"${file.filename}" exceeds the 100 MiB transfer limit.`;
        }
        const filename = path.posix.basename(String(file.filename).replace(/\\/g, '/'));
        const result = await workspaceClient().uploadInput(identity, filename, buffer);
        return `Attached "${file.filename}" (${result.bytes} bytes) to the workspace at "${result.path}".`;
      } catch (error) {
        return `Workspace upload failed: ${errorText(error)}`;
      }
    },
    {
      name: 'attach_chat_file',
      description:
        'Copy the selected file attached to this message into this conversation workspace inputs/ folder. Only the file_id you provide is transferred.',
      schema: z.object({
        file_id: z.string().describe('The file_id of one file attached to the current message'),
      }),
    },
  );
}

function createDeliverWorkspaceFileTool({ req }) {
  return tool(
    async ({ path: workspacePath }) => {
      const identity = conversationIdentity(req);
      if (!identity) {
        return ['A saved conversation is required to use the workspace.', null];
      }
      try {
        const download = await workspaceClient().downloadOutput(identity, workspacePath);
        if (download.buffer.length > OUTPUT_MAX_BYTES) {
          return ['Delivery failed: workspace output exceeds the 15 MiB limit.', null];
        }
        const appConfig = req.config;
        const { saveBuffer } = getStrategyFunctions(appConfig.fileStrategy);
        if (!saveBuffer) {
          return ['Delivery failed: file storage is not available on this deployment.', null];
        }
        const file_id = v4();
        const filename = path.posix.basename(String(download.filename).replace(/\\/g, '/'));
        const mimeType = download.contentType?.split(';')[0].trim() || 'application/octet-stream';
        const filepath = await saveBuffer({
          userId: req.user.id,
          buffer: download.buffer,
          fileName: `${file_id}__${filename}`,
          basePath: 'uploads',
          tenantId: req.user.tenantId,
        });
        const file = await createFile(
          {
            user: req.user.id,
            tenantId: req.user.tenantId,
            file_id,
            object: 'file',
            filename,
            filepath,
            bytes: download.buffer.length,
            type: mimeType,
            ...(await previewText(download.buffer, filename, mimeType)),
            context: FileContext.workspace,
            source: appConfig.fileStrategy,
            usage: 0,
          },
          true,
        );
        return [
          `Delivered "${filename}" (${download.buffer.length} bytes) as a chat attachment.`,
          { workspaceFile: file },
        ];
      } catch (error) {
        return [`Delivery failed: ${errorText(error)}`, null];
      }
    },
    {
      name: 'deliver_workspace_file',
      description:
        'Download a validated file from this conversation workspace outputs/ folder and attach it to the chat for the user.',
      schema: z.object({
        path: z.string().describe('Workspace-relative path under outputs/'),
      }),
      responseFormat: 'content_and_artifact',
    },
  );
}

module.exports = { createAttachChatFileTool, createDeliverWorkspaceFileTool };

const path = require('path');
const { z } = require('zod');
const { v4 } = require('uuid');
const { Readable } = require('stream');
const { buffer: streamToBuffer } = require('stream/consumers');
const { tool } = require('@librechat/agents/langchain/tools');
const { FileContext } = require('librechat-data-provider');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { rokoClient } = require('~/server/services/roko');
const { findFileById, createFile } = require('~/models');

/**
 * Chat-side transfer tools for the leedeo-filestore integration. Both are
 * injected only when the chat has a session and both take a `filestore_uid`,
 * so the session hooks gate them exactly like the drive tools (an unattached
 * store raises the attach-approval popup before the transfer runs).
 */

/** Matches the filestore service's buffered-transfer cap (it 413s above). */
const TRANSFER_MAX_BYTES = 100 * 1024 * 1024;

const errorText = (error) => (error instanceof Error ? error.message : String(error));

/** Push a file the user attached in this chat into a filestore. */
function createUploadChatFileTool({ req }) {
  return tool(
    async ({ file_id, filestore_uid, path: destination }) => {
      const userId = req.user?.id;
      const file = await findFileById(file_id);
      if (!file || String(file.user) !== String(userId)) {
        return `No file with file_id "${file_id}" is attached to this chat.`;
      }
      if ((file.bytes ?? 0) > TRANSFER_MAX_BYTES) {
        return `"${file.filename}" exceeds the 100 MiB transfer limit.`;
      }
      const { getDownloadStream } = getStrategyFunctions(file.source);
      if (!getDownloadStream) {
        return `Files stored via "${file.source}" cannot be transferred.`;
      }
      try {
        const stream = await getDownloadStream(req, file.filepath);
        const buffer = await streamToBuffer(stream);
        const result = await rokoClient.uploadFile(filestore_uid, destination || file.filename, {
          buffer,
          filename: file.filename,
          contentType: file.type,
        });
        return `Uploaded "${file.filename}" (${result.bytes} bytes) to file store ${filestore_uid} at "${result.path}".`;
      } catch (error) {
        return `Upload failed: ${errorText(error)}`;
      }
    },
    {
      name: 'upload_chat_file',
      description: [
        'Upload a file the user attached in this chat (drag-and-drop or paperclip) into a file store, using its file_id.',
        'Only use this when storing the file is clearly relevant to the task, and pick the file store whose purpose matches the file — never upload speculatively or to an unrelated store.',
        'Destinations are never overwritten; a conflicting path fails. If the target store is not attached to this session the user is asked first.',
      ].join(' '),
      schema: z.object({
        file_id: z.string().describe('The file_id of a file the user attached in this chat'),
        filestore_uid: z.string().describe('The file store to upload into'),
        path: z
          .string()
          .optional()
          .describe(
            'Store-relative destination path (e.g. reports/summary.pdf); defaults to the original filename at the store root',
          ),
      }),
    },
  );
}

/** Fetch a filestore file and hand it to the user as a downloadable chat attachment. */
function createDeliverFilestoreFileTool({ req }) {
  return tool(
    async ({ filestore_uid, path: filePath }) => {
      try {
        const download = await rokoClient.downloadFile(filestore_uid, filePath);
        const buffer = await streamToBuffer(Readable.fromWeb(download.stream));
        const appConfig = req.config;
        const { saveBuffer } = getStrategyFunctions(appConfig.fileStrategy);
        if (!saveBuffer) {
          return ['Delivery failed: file storage is not available on this deployment.', null];
        }
        const file_id = v4();
        const filename = path.posix.basename(filePath);
        const filepath = await saveBuffer({
          userId: req.user.id,
          buffer,
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
            bytes: buffer.length,
            type: download.contentType,
            context: FileContext.filestore,
            source: appConfig.fileStrategy,
            usage: 0,
          },
          true,
        );
        return [
          `Delivered "${filename}" (${buffer.length} bytes) from file store ${filestore_uid} — it now appears in the chat as a download button for the user.`,
          { filestoreFile: file },
        ];
      } catch (error) {
        return [`Delivery failed: ${errorText(error)}`, null];
      }
    },
    {
      name: 'deliver_filestore_file',
      description: [
        'Hand a file from a file store to the user: it appears in the chat as a downloadable attachment.',
        'Use this when the user asks for a file or when giving them the produced file is the point of the task.',
        'If the store is not attached to this session the user is asked first. Files over 100 MiB cannot be transferred.',
      ].join(' '),
      schema: z.object({
        filestore_uid: z.string().describe('The file store to fetch from'),
        path: z.string().describe('Store-relative path of the file to deliver'),
      }),
      responseFormat: 'content_and_artifact',
    },
  );
}

module.exports = { createUploadChatFileTool, createDeliverFilestoreFileTool };

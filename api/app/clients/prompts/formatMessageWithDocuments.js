const { formatMessage: formatSDKMessage } = require('@librechat/agents');
const { ContentTypes } = require('librechat-data-provider');

function formatDocumentForLangChain(document) {
  const file = document.type === 'file' ? document.file : document.type === 'input_file' ? document : null;
  if (!file || typeof file.file_data !== 'string') {
    return document;
  }
  const dataUrl = /^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(file.file_data);
  if (!dataUrl) {
    throw new Error('The attached file does not contain a valid base64 data URL.');
  }
  // Responses drops native Chat Completions `file` blocks. The LangChain
  // data block is supported by both converters, regardless of API auto-selection.
  return {
    type: 'file',
    source_type: 'base64',
    mime_type: dataUrl[1],
    data: dataUrl[2],
    metadata: { filename: file.filename ?? 'document' },
  };
}

function formatMessage(params) {
  const documents = params.message?.documents;
  if (!Array.isArray(documents) || documents.length === 0) {
    return formatSDKMessage(params);
  }

  // AgentClient uses the SDK formatter, not the legacy prompt formatter.
  const formatted = formatSDKMessage({
    ...params,
    message: { ...params.message, documents: undefined },
  });
  if (formatted.role !== 'user') {
    return formatted;
  }
  const content = Array.isArray(formatted.content)
    ? formatted.content
    : [{ type: ContentTypes.TEXT, text: formatted.content ?? '' }];
  formatted.content = [...content, ...documents.map(formatDocumentForLangChain)];
  return formatted;
}

module.exports = { formatMessage };

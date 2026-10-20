const BRIDGE_OUTPUT_PREFIX = '\u001eLIBRECHAT_OUTPUT_V1\u001e';
const MAX_OUTPUT_FILE_COUNT = 10;
const MAX_OUTPUT_FILE_BYTES = 15 * 1024 * 1024;
const MAX_OUTPUT_TOTAL_BYTES = 15 * 1024 * 1024;
const MIME_TYPE_PATTERN = /^[\w.+-]+\/[\w.+-]+$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function parseBridgeOutput(content) {
  if (typeof content !== 'string' || !content.startsWith(BRIDGE_OUTPUT_PREFIX)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(content.slice(BRIDGE_OUTPUT_PREFIX.length));
  } catch (error) {
    throw new Error('Bridge returned malformed generated-file metadata.', { cause: error });
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof payload.text !== 'string' ||
    !Array.isArray(payload.files) ||
    payload.files.length > MAX_OUTPUT_FILE_COUNT
  ) {
    throw new Error('Bridge returned invalid generated-file metadata.');
  }

  let totalBytes = 0;
  const files = payload.files.map((file) => {
    if (
      !file ||
      typeof file.filename !== 'string' ||
      file.filename.length === 0 ||
      file.filename.length > 255 ||
      /[\\/\u0000-\u001f\u007f]/.test(file.filename) ||
      file.filename === '.' ||
      file.filename === '..' ||
      typeof file.mimeType !== 'string' ||
      !MIME_TYPE_PATTERN.test(file.mimeType) ||
      typeof file.data !== 'string' ||
      file.data.length > Math.ceil(MAX_OUTPUT_FILE_BYTES / 3) * 4 ||
      !BASE64_PATTERN.test(file.data)
    ) {
      throw new Error('Bridge returned invalid generated-file metadata.');
    }

    const buffer = Buffer.from(file.data, 'base64');
    if (
      buffer.toString('base64') !== file.data ||
      buffer.length > MAX_OUTPUT_FILE_BYTES ||
      totalBytes + buffer.length > MAX_OUTPUT_TOTAL_BYTES
    ) {
      throw new Error('Bridge generated files exceed LibreChat storage limits.');
    }
    totalBytes += buffer.length;
    return { filename: file.filename, mimeType: file.mimeType, buffer };
  });

  return { text: payload.text, files };
}

module.exports = { parseBridgeOutput };

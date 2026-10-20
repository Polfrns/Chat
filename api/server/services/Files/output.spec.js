const { parseBridgeOutput } = require('./output');

const prefix = '\u001eLIBRECHAT_OUTPUT_V1\u001e';

describe('parseBridgeOutput', () => {
  test('ignores ordinary assistant text', () => {
    expect(parseBridgeOutput('A normal answer.')).toBeNull();
  });

  test('parses text and file bytes from a valid bridge payload', () => {
    expect(
      parseBridgeOutput(
        prefix +
          JSON.stringify({
            text: 'The file is ready.',
            files: [{ filename: 'answer.txt', mimeType: 'text/plain', data: 'b2s=' }],
          }),
      ),
    ).toEqual({
      text: 'The file is ready.',
      files: [{ filename: 'answer.txt', mimeType: 'text/plain', buffer: Buffer.from('ok') }],
    });
  });

  test.each([
    '{',
    JSON.stringify({
      text: '',
      files: [{ filename: '..\\outside.txt', mimeType: 'text/plain', data: 'b2s=' }],
    }),
    JSON.stringify({
      text: '',
      files: [{ filename: 'answer.txt', mimeType: 'text/plain', data: 'not base64' }],
    }),
  ])('rejects malformed, unsafe, or invalid file payloads', (payload) => {
    expect(() => parseBridgeOutput(prefix + payload)).toThrow();
  });
});

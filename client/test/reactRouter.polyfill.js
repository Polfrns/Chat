/**
 * react-router v7 needs a few Web APIs that jest's jsdom environment does not expose:
 * - TextEncoder/TextDecoder are read at module load time.
 * - Data routers (createMemoryRouter/createBrowserRouter) build a `Request` for every
 *   navigation and read `request.method` / `request.signal`.
 * Must be imported before any module that imports react-router.
 */
const { TextEncoder, TextDecoder } = require('util');

if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder;
}
if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = TextDecoder;
}

if (typeof globalThis.Request === 'undefined') {
  class RequestPolyfill {
    constructor(input, init = {}) {
      const source = typeof input === 'object' && input !== null && 'url' in input ? input : null;
      this.url = source ? source.url : String(input);
      this.method = String(init.method ?? source?.method ?? 'GET').toUpperCase();
      this.signal = init.signal ?? source?.signal ?? new AbortController().signal;
      this.headers = init.headers ?? source?.headers ?? {};
      this.body = init.body ?? source?.body ?? null;
    }

    clone() {
      return new RequestPolyfill(this);
    }
  }
  globalThis.Request = RequestPolyfill;
}

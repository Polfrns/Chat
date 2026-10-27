/**
 * Runs Express middleware in-process against a captured response, so callers that
 * are not HTTP routes (chat tools) reuse a route's guards and handlers unchanged.
 *
 * @param {Array<Function>} chain - Middleware in route order; the last one must respond.
 * @param {object} req - Request-shaped object (user, params, body, query, config).
 * @returns {Promise<{ status: number, body: unknown }>}
 */
async function runMiddlewareChain(chain, req) {
  const captured = { status: 200, body: undefined };
  let respond = () => undefined;
  const res = {
    status(code) {
      captured.status = code;
      return res;
    },
    json(body) {
      captured.body = body;
      respond();
      return res;
    },
    send(body) {
      captured.body = body;
      respond();
      return res;
    },
    sendStatus(code) {
      captured.status = code;
      respond();
      return res;
    },
    set() {
      return res;
    },
    setHeader() {
      return res;
    },
  };

  for (const middleware of chain) {
    const outcome = await new Promise((resolve, reject) => {
      respond = () => resolve('responded');
      const next = (error) => (error ? reject(error) : resolve('next'));
      Promise.resolve()
        .then(() => middleware(req, res, next))
        .catch(reject);
    });
    if (outcome === 'responded') {
      return captured;
    }
  }
  throw new Error('Middleware chain finished without sending a response');
}

module.exports = { runMiddlewareChain };

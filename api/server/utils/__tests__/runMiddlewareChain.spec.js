const { runMiddlewareChain } = require('../runMiddlewareChain');

describe('runMiddlewareChain', () => {
  it('runs guards in order and returns the handler response', async () => {
    const seen = [];
    const guard = async (req, _res, next) => {
      seen.push(`guard:${req.params.id}`);
      next();
    };
    const handler = (_req, res) => res.status(201).json({ ok: true });
    await expect(runMiddlewareChain([guard, handler], { params: { id: 'a' } })).resolves.toEqual({
      status: 201,
      body: { ok: true },
    });
    expect(seen).toEqual(['guard:a']);
  });

  it('stops at a guard that responds, without reaching the handler', async () => {
    const handler = jest.fn();
    const deny = (_req, res) => res.status(403).json({ error: 'Forbidden' });
    await expect(runMiddlewareChain([deny, handler], {})).resolves.toEqual({
      status: 403,
      body: { error: 'Forbidden' },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('propagates errors passed to next or thrown by async middleware', async () => {
    const failing = (_req, _res, next) => next(new Error('boom'));
    await expect(runMiddlewareChain([failing], {})).rejects.toThrow('boom');
    const throwing = async () => {
      throw new Error('async boom');
    };
    await expect(runMiddlewareChain([throwing], {})).rejects.toThrow('async boom');
  });

  it('rejects a chain that never responds', async () => {
    const pass = (_req, _res, next) => next();
    await expect(runMiddlewareChain([pass], {})).rejects.toThrow(/without sending a response/);
  });
});

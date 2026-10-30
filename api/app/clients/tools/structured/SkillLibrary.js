const { z } = require('zod');
const { tool } = require('@librechat/agents/langchain/tools');
const { skillDeletionRequests } = require('@librechat/api');
const {
  SKILL_LIBRARY_TOOL_NAME,
  SKILL_LIBRARY_TOOL_DESCRIPTION,
} = require('librechat-data-provider');
const { runMiddlewareChain } = require('~/server/utils/runMiddlewareChain');

/**
 * Chat access to the skill library. Each operation runs the REST route's
 * middleware chain with the chat user's request context, so role permissions,
 * per-skill ACLs and validation are identical to the Skills UI.
 */
function createSkillLibraryTool({ req }) {
  // Required lazily: the CRUD module pulls in the route middleware stack.
  const { checkSkillAccess, skillCrudChains } = require('~/server/services/Skills/crud');

  const call = (operation, { id, body, query } = {}) => {
    const scoped = Object.create(req);
    scoped.params = id ? { id } : {};
    scoped.body = body ?? {};
    scoped.query = query ?? {};
    return runMiddlewareChain([checkSkillAccess, ...skillCrudChains[operation]], scoped);
  };

  const failure = ({ status, body }) => ({
    error: body?.message || body?.error || `Skill operation failed (${status})`,
    ...(Array.isArray(body?.issues) ? { issues: body.issues.map((issue) => issue.message) } : {}),
  });

  const summary = (skill) => ({
    skill_id: skill._id,
    name: skill.name,
    description: skill.description,
    version: skill.version,
    ...(skill.alwaysApply ? { always_apply: true } : {}),
  });

  async function confirmDeletion(skill) {
    const userId = req.user.id;
    const requestId = await skillDeletionRequests.add(userId, {
      skillId: skill._id,
      name: skill.name,
      description: skill.description,
      conversationId: req.body?.conversationId,
    });
    try {
      return await skillDeletionRequests.waitForDecision(userId, requestId);
    } finally {
      await skillDeletionRequests.remove(userId, requestId);
    }
  }

  const operations = {
    async list({ search }) {
      const result = await call('list', { query: { search, limit: '100' } });
      return result.status === 200
        ? { skills: result.body.skills.map(summary), has_more: result.body.has_more }
        : failure(result);
    },
    async read({ skill_id }) {
      const result = await call('get', { id: skill_id });
      return result.status === 200
        ? { ...summary(result.body), body: result.body.body }
        : failure(result);
    },
    async create({ name, description, body, always_apply }) {
      const result = await call('create', {
        body: {
          name,
          description,
          body,
          ...(always_apply != null ? { alwaysApply: always_apply } : {}),
        },
      });
      return result.status === 201 ? { created: summary(result.body) } : failure(result);
    },
    async update({ skill_id, expected_version, name, description, body, always_apply }) {
      let version = expected_version;
      if (version == null) {
        const current = await call('get', { id: skill_id });
        if (current.status !== 200) return failure(current);
        version = current.body.version;
      }
      const changes = Object.fromEntries(
        Object.entries({ name, description, body, alwaysApply: always_apply }).filter(
          ([, value]) => value != null,
        ),
      );
      const result = await call('update', {
        id: skill_id,
        body: { ...changes, expectedVersion: version },
      });
      if (result.status === 409 && result.body?.current) {
        return {
          error: 'The skill changed since it was read; read it again and retry.',
          current_version: result.body.current.version,
        };
      }
      return result.status === 200 ? { updated: summary(result.body) } : failure(result);
    },
    async delete({ skill_id }) {
      const current = await call('get', { id: skill_id });
      if (current.status !== 200) return failure(current);
      const decision = await confirmDeletion(current.body);
      if (decision !== 'approve') {
        return {
          deleted: false,
          reason:
            decision === 'deny'
              ? 'The user rejected the deletion.'
              : 'The user did not confirm in time.',
        };
      }
      const result = await call('remove', { id: skill_id });
      return result.status === 200 ? { deleted: true, name: current.body.name } : failure(result);
    },
  };

  return tool(
    async ({ operation, ...input }) => {
      if (!req.user?.id) return JSON.stringify({ error: 'Authentication required' });
      const needsId = operation !== 'list' && operation !== 'create';
      if (needsId && !input.skill_id)
        return JSON.stringify({ error: `skill_id is required for ${operation}` });
      try {
        return JSON.stringify(await operations[operation](input));
      } catch {
        return JSON.stringify({ error: 'Skill operation failed' });
      }
    },
    {
      name: SKILL_LIBRARY_TOOL_NAME,
      description: SKILL_LIBRARY_TOOL_DESCRIPTION,
      schema: z.object({
        operation: z.enum(['list', 'read', 'create', 'update', 'delete']),
        skill_id: z
          .string()
          .optional()
          .describe('Skill id from list; required for read, update and delete'),
        search: z.string().optional().describe('Filter for list'),
        name: z.string().optional(),
        description: z
          .string()
          .optional()
          .describe('What the skill does and when it should be used'),
        body: z.string().optional().describe('Complete Markdown instructions of the skill'),
        always_apply: z
          .boolean()
          .optional()
          .describe('Apply the skill in every chat without being invoked'),
        expected_version: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Version from read; guards against overwriting newer edits'),
      }),
    },
  );
}

module.exports = { createSkillLibraryTool };

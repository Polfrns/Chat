const { generateCheckAccess } = require('@librechat/api');
const { PermissionBits, PermissionTypes, Permissions } = require('librechat-data-provider');
const { getRoleByName } = require('~/models');
const {
  canAccessSkillResource,
} = require('~/server/middleware/accessResources/canAccessSkillResource');
const { getSkillsHandlers } = require('./handlers');

/**
 * Skill CRUD expressed as Express middleware chains. The REST routes and the chat
 * `skill_library` tool both run these chains, so a skill edited from a chat goes
 * through the same role gates, per-skill ACL checks and validation as the UI.
 */

const checkSkillAccess = generateCheckAccess({
  permissionType: PermissionTypes.SKILLS,
  permissions: [Permissions.USE],
  getRoleByName,
});
const checkSkillCreate = generateCheckAccess({
  permissionType: PermissionTypes.SKILLS,
  permissions: [Permissions.USE, Permissions.CREATE],
  getRoleByName,
});

const skillHandlers = getSkillsHandlers();

/** Chains after the router-wide `checkSkillAccess` gate; `req.params.id` names the skill. */
const skillCrudChains = {
  list: [skillHandlers.list],
  get: [canAccessSkillResource({ requiredPermission: PermissionBits.VIEW }), skillHandlers.get],
  create: [checkSkillCreate, skillHandlers.create],
  /** Named after the handler: an `update` key reads as a Mongo update to the DocumentDB scan. */
  patch: [
    checkSkillCreate,
    canAccessSkillResource({ requiredPermission: PermissionBits.EDIT }),
    skillHandlers.patch,
  ],
  remove: [
    checkSkillCreate,
    canAccessSkillResource({ requiredPermission: PermissionBits.DELETE }),
    skillHandlers.delete,
  ],
};

module.exports = {
  checkSkillAccess,
  checkSkillCreate,
  skillHandlers,
  skillCrudChains,
};

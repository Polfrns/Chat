const { createSkillsHandlers, generateCheckAccess } = require('@librechat/api');
const { isValidObjectIdString } = require('@librechat/data-schemas');
const { PermissionBits, PermissionTypes, Permissions } = require('librechat-data-provider');
const {
  createSkill,
  updateSkill,
  deleteSkill,
  deleteSkillFile,
  getRoleByName,
} = require('~/models');
const {
  canAccessSkillResource,
} = require('~/server/middleware/accessResources/canAccessSkillResource');
const {
  findAccessibleResources,
  findPubliclyAccessibleResources,
  hasPublicPermission,
  grantPermission,
} = require('~/server/services/PermissionService');
const {
  getSkillDbMethods,
  withDeploymentSkillIds,
  getSkillStrategyFunctions,
} = require('~/server/services/Endpoints/agents/skillDeps');

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

const skillDbMethods = getSkillDbMethods();
const isVisibilityQuery = (params) =>
  params.resourceType === 'skill' && params.requiredPermissions === PermissionBits.VIEW;

const skillHandlers = createSkillsHandlers({
  createSkill,
  getSkillById: skillDbMethods.getSkillById,
  listSkillsByAccess: skillDbMethods.listSkillsByAccess,
  updateSkill,
  deleteSkill,
  listSkillFiles: skillDbMethods.listSkillFiles,
  deleteSkillFile,
  getSkillFileByPath: skillDbMethods.getSkillFileByPath,
  updateSkillFileContent: skillDbMethods.updateSkillFileContent,
  getStrategyFunctions: getSkillStrategyFunctions,
  findAccessibleResources: async (params) =>
    isVisibilityQuery(params)
      ? withDeploymentSkillIds(await findAccessibleResources(params))
      : findAccessibleResources(params),
  findPubliclyAccessibleResources: async (params) =>
    isVisibilityQuery(params)
      ? withDeploymentSkillIds(await findPubliclyAccessibleResources(params))
      : findPubliclyAccessibleResources(params),
  hasPublicPermission: async (params) =>
    isVisibilityQuery(params)
      ? withDeploymentSkillIds([]).some((id) => id.toString() === params.resourceId.toString()) ||
        hasPublicPermission(params)
      : hasPublicPermission(params),
  grantPermission,
  isValidObjectIdString,
});

/** Chains after the router-wide `checkSkillAccess` gate; `req.params.id` names the skill. */
const skillCrudChains = {
  list: [skillHandlers.list],
  get: [canAccessSkillResource({ requiredPermission: PermissionBits.VIEW }), skillHandlers.get],
  create: [checkSkillCreate, skillHandlers.create],
  update: [
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
  skillDbMethods,
  skillHandlers,
  skillCrudChains,
};

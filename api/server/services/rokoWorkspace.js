const { logger } = require('@librechat/data-schemas');
const {
  readRokoWorkspaceConfig,
  RokoWorkspaceClient,
  rokoWorkspaceIdentity,
} = require('@librechat/api');

async function deleteConversationWorkspace(user, conversationId) {
  const identity = rokoWorkspaceIdentity({ user, conversationId });
  if (!identity) {
    return;
  }
  try {
    const config = readRokoWorkspaceConfig();
    if (!config) {
      return;
    }
    await new RokoWorkspaceClient(config).deleteWorkspace(identity);
  } catch (error) {
    logger.warn(
      `[Roko workspace] Failed to delete workspace for conversation ${conversationId}`,
      error,
    );
  }
}

async function deleteConversationWorkspaces(user, conversationIds) {
  await Promise.all(conversationIds.map((id) => deleteConversationWorkspace(user, id)));
}

module.exports = { deleteConversationWorkspace, deleteConversationWorkspaces };

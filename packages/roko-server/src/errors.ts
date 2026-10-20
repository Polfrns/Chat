/**
 * Typed domain failures raised by the core service. Each face maps them to its
 * own vocabulary — REST to a status code, MCP to an `isError` tool result — so
 * the core never knows about HTTP or the MCP wire format.
 */

/** Caller lacks access to the target (wrong tenant, private store, not owner). */
export class AccessError extends Error {}

/** The target filestore or file does not exist. */
export class NotFoundError extends Error {}

/** A write was attempted against a read-only filestore. */
export class ReadOnlyError extends Error {}

/** A store-relative path resolved outside the filestore root. */
export class TraversalError extends Error {}

/** Caller input was missing or malformed. */
export class ValidationError extends Error {}

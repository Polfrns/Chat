import { z } from 'zod';
import { MAX_SUBAGENTS, ViolationTypes, ErrorTypes } from 'librechat-data-provider';
import type { Agent, TModelsConfig } from 'librechat-data-provider';
import type { Request, Response } from 'express';

/**
 * Permissive Request alias used by {@link validateAgentModel}. Accepts either
 * the default Express `Request` or the project-specific `ServerRequest`
 * (see `~/types/http`), whose `params` type is widened to `unknown`.
 */
type LooseRequest = Request<unknown, unknown, unknown>;

/*
 * Explicit schema types below are required by the isolated-declarations DTS
 * emitter (tsdown `dts.oxc`), which cannot infer exported initializer types.
 */
type StripObject<Shape extends z.core.$ZodShape> = z.ZodObject<Shape, z.core.$strip>;
type OptionalStringArray = z.ZodOptional<z.ZodArray<z.ZodString>>;
/** `''` → `undefined` transform applied to optional string fields */
type EmptyToUndefined<T extends z.ZodType> = z.ZodPipe<
  z.ZodOptional<T>,
  z.ZodTransform<z.output<T> | undefined, z.output<T> | undefined>
>;

type AgentAvatarShape = {
  filepath: z.ZodString;
  source: z.ZodString;
};

type AgentBaseResourceShape = {
  file_ids: OptionalStringArray;
  files: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
};

type AgentFileResourceShape = AgentBaseResourceShape & {
  vector_store_ids: OptionalStringArray;
};

type AgentToolResourcesShape = {
  image_edit: z.ZodOptional<StripObject<AgentBaseResourceShape>>;
  execute_code: z.ZodOptional<StripObject<AgentBaseResourceShape>>;
  file_search: z.ZodOptional<StripObject<AgentFileResourceShape>>;
  context: z.ZodOptional<StripObject<AgentBaseResourceShape>>;
  /** @deprecated Use context instead */
  ocr: z.ZodOptional<StripObject<AgentBaseResourceShape>>;
};

type AgentSupportContactShape = {
  name: z.ZodOptional<z.ZodString>;
  email: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<''>, z.ZodString]>>;
};

type GraphEdgeShape = {
  from: z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>;
  to: z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>;
  description: EmptyToUndefined<z.ZodString>;
  edgeType: z.ZodOptional<z.ZodEnum<{ handoff: 'handoff'; direct: 'direct' }>>;
  prompt: EmptyToUndefined<z.ZodUnion<readonly [z.ZodString, z.ZodFunction]>>;
  excludeResults: z.ZodOptional<z.ZodBoolean>;
  promptKey: EmptyToUndefined<z.ZodString>;
};

type ToolOptionsShape = {
  defer_loading: z.ZodOptional<z.ZodBoolean>;
  allowed_callers: z.ZodOptional<
    z.ZodArray<z.ZodEnum<{ direct: 'direct'; code_execution: 'code_execution' }>>
  >;
};

type AgentSubagentsShape = {
  enabled: z.ZodOptional<z.ZodBoolean>;
  allowSelf: z.ZodOptional<z.ZodBoolean>;
  agent_ids: OptionalStringArray;
};

type AgentBaseShape = {
  name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  instructions: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  avatar: z.ZodOptional<z.ZodNullable<StripObject<AgentAvatarShape>>>;
  model_parameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  tools: OptionalStringArray;
  skills: OptionalStringArray;
  skills_enabled: z.ZodOptional<z.ZodBoolean>;
  /** @deprecated Use edges instead */
  agent_ids: OptionalStringArray;
  edges: z.ZodOptional<z.ZodArray<StripObject<GraphEdgeShape>>>;
  end_after_tools: z.ZodOptional<z.ZodBoolean>;
  hide_sequential_outputs: z.ZodOptional<z.ZodBoolean>;
  artifacts: z.ZodOptional<z.ZodString>;
  recursion_limit: z.ZodOptional<z.ZodNumber>;
  conversation_starters: OptionalStringArray;
  tool_resources: z.ZodOptional<StripObject<AgentToolResourcesShape>>;
  tool_options: z.ZodOptional<z.ZodRecord<z.ZodString, StripObject<ToolOptionsShape>>>;
  subagents: z.ZodOptional<StripObject<AgentSubagentsShape>>;
  support_contact: z.ZodOptional<StripObject<AgentSupportContactShape>>;
  category: z.ZodOptional<z.ZodString>;
};

/** Avatar schema shared between create and update */
export const agentAvatarSchema: StripObject<AgentAvatarShape> = z.object({
  filepath: z.string(),
  source: z.string(),
});

/** Base resource schema for tool resources */
export const agentBaseResourceSchema: StripObject<AgentBaseResourceShape> = z.object({
  file_ids: z.array(z.string()).optional(),
  files: z.array(z.unknown()).optional(), // Files are populated at runtime, not from user input
});

/** File resource schema extends base with vector_store_ids */
export const agentFileResourceSchema: StripObject<AgentFileResourceShape> =
  agentBaseResourceSchema.extend({
    vector_store_ids: z.array(z.string()).optional(),
  });

/** Tool resources schema matching AgentToolResources interface */
export const agentToolResourcesSchema: z.ZodOptional<StripObject<AgentToolResourcesShape>> = z
  .object({
    image_edit: agentBaseResourceSchema.optional(),
    execute_code: agentBaseResourceSchema.optional(),
    file_search: agentFileResourceSchema.optional(),
    context: agentBaseResourceSchema.optional(),
    /** @deprecated Use context instead */
    ocr: agentBaseResourceSchema.optional(),
  })
  .optional();

/** Support contact schema for agent */
export const agentSupportContactSchema: z.ZodOptional<StripObject<AgentSupportContactShape>> = z
  .object({
    name: z.string().optional(),
    email: z.union([z.literal(''), z.string().email()]).optional(),
  })
  .optional();

/** Graph edge schema for agent handoffs */
export const graphEdgeSchema: StripObject<GraphEdgeShape> = z.object({
  from: z.union([z.string(), z.array(z.string())]),
  to: z.union([z.string(), z.array(z.string())]),
  description: z
    .string()
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  edgeType: z.enum(['handoff', 'direct']).optional(),
  prompt: z
    .union([z.string(), z.function()])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  excludeResults: z.boolean().optional(),
  promptKey: z
    .string()
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
});

/** Per-tool options schema (defer_loading, allowed_callers) */
export const toolOptionsSchema: StripObject<ToolOptionsShape> = z.object({
  defer_loading: z.boolean().optional(),
  allowed_callers: z.array(z.enum(['direct', 'code_execution'])).optional(),
});

/** Agent tool options - map of tool_id to tool options */
export const agentToolOptionsSchema: z.ZodOptional<
  z.ZodRecord<z.ZodString, StripObject<ToolOptionsShape>>
> = z.record(z.string(), toolOptionsSchema).optional();

/**
 * Subagent spawning configuration for an agent. `agent_ids` is capped at
 * `Constants.MAX_SUBAGENTS` so a crafted API request cannot trigger hundreds
 * of `processAgent` calls (DB lookup + permission check + tool loading).
 * The UI enforces the same cap, so legitimate payloads never hit the bound.
 */
export const agentSubagentsSchema: z.ZodOptional<StripObject<AgentSubagentsShape>> = z
  .object({
    enabled: z.boolean().optional(),
    allowSelf: z.boolean().optional(),
    agent_ids: z.array(z.string()).max(MAX_SUBAGENTS).optional(),
  })
  .optional();

/** Base agent schema with all common fields */
export const agentBaseSchema: StripObject<AgentBaseShape> = z.object({
  name: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  instructions: z.string().nullable().optional(),
  avatar: agentAvatarSchema.nullable().optional(),
  model_parameters: z.record(z.string(), z.unknown()).optional(),
  tools: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  skills_enabled: z.boolean().optional(),
  /** @deprecated Use edges instead */
  agent_ids: z.array(z.string()).optional(),
  edges: z.array(graphEdgeSchema).optional(),
  end_after_tools: z.boolean().optional(),
  hide_sequential_outputs: z.boolean().optional(),
  artifacts: z.string().optional(),
  recursion_limit: z.number().optional(),
  conversation_starters: z.array(z.string()).optional(),
  tool_resources: agentToolResourcesSchema,
  tool_options: agentToolOptionsSchema,
  subagents: agentSubagentsSchema,
  support_contact: agentSupportContactSchema,
  category: z.string().optional(),
});

/** Create schema extends base with required fields for creation */
export const agentCreateSchema: StripObject<
  Omit<AgentBaseShape, 'tools'> & {
    provider: z.ZodString;
    model: z.ZodNullable<z.ZodString>;
    tools: z.ZodDefault<OptionalStringArray>;
  }
> = agentBaseSchema.extend({
  provider: z.string(),
  model: z.string().nullable(),
  tools: z.array(z.string()).optional().default([]),
});

/** Update schema extends base with all fields optional and additional update-only fields */
export const agentUpdateSchema: StripObject<
  Omit<AgentBaseShape, 'avatar'> & {
    avatar: z.ZodOptional<z.ZodUnion<readonly [StripObject<AgentAvatarShape>, z.ZodNull]>>;
    provider: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  }
> = agentBaseSchema.extend({
  avatar: z.union([agentAvatarSchema, z.null()]).optional(),
  provider: z.string().optional(),
  model: z.string().nullable().optional(),
});

export interface ValidateAgentModelParams {
  req: LooseRequest;
  res: Response;
  agent: Agent;
  modelsConfig: TModelsConfig;
  logViolation: (
    req: LooseRequest,
    res: Response,
    type: string,
    errorMessage: Record<string, unknown>,
    score?: number | string,
  ) => Promise<void>;
}

interface ValidateAgentModelResult {
  isValid: boolean;
  error?: {
    message: string;
  };
}

/**
 * Validates an agent's model against the available models configuration.
 * This is a non-middleware version of validateModel that can be used
 * in service initialization flows.
 *
 * @param params - Validation parameters
 * @returns Object indicating whether the model is valid and any error details
 */
export async function validateAgentModel(
  params: ValidateAgentModelParams,
): Promise<ValidateAgentModelResult> {
  const { req, res, agent, modelsConfig, logViolation } = params;
  const { model, provider: endpoint } = agent;

  if (!model) {
    return {
      isValid: false,
      error: {
        message: `{ "type": "${ErrorTypes.MISSING_MODEL}", "info": "${endpoint}" }`,
      },
    };
  }

  if (!modelsConfig) {
    return {
      isValid: false,
      error: {
        message: `{ "type": "${ErrorTypes.MODELS_NOT_LOADED}" }`,
      },
    };
  }

  const availableModels = modelsConfig[endpoint];
  if (!availableModels) {
    return {
      isValid: false,
      error: {
        message: `{ "type": "${ErrorTypes.ENDPOINT_MODELS_NOT_LOADED}", "info": "${endpoint}" }`,
      },
    };
  }

  const validModel = !!availableModels.find((availableModel) => availableModel === model);

  if (validModel) {
    return { isValid: true };
  }

  const { ILLEGAL_MODEL_REQ_SCORE: score = 1 } = process.env ?? {};
  const type = ViolationTypes.ILLEGAL_MODEL_REQUEST;
  const errorMessage = {
    type,
    model,
    endpoint,
  };

  await logViolation(req, res, type, errorMessage, score);

  return {
    isValid: false,
    error: {
      message: `{ "type": "${ViolationTypes.ILLEGAL_MODEL_REQUEST}", "info": "${endpoint}|${model}" }`,
    },
  };
}

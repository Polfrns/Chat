export type BridgeProvider = 'codex' | 'claude';

export type BridgeCapabilities = Readonly<{
  provider: BridgeProvider;
  efforts: readonly string[];
  supportsVerbosity: boolean;
  supportsSummary: boolean;
  supportsWebSearch: boolean;
}>;

const CODEX: BridgeCapabilities = {
  provider: 'codex',
  efforts: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'persistent'],
  supportsVerbosity: true,
  supportsSummary: true,
  supportsWebSearch: true,
};
const CLAUDE: BridgeCapabilities = {
  provider: 'claude',
  efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  supportsVerbosity: false,
  supportsSummary: false,
  supportsWebSearch: true,
};

/** Prefix of the `toolCallId` of the files a Bridge model produced; the client shows them per message. */
export const BRIDGE_OUTPUT_TOOL_CALL_PREFIX = 'bridge-output-';

/** The single list of Bridge model aliases; every Bridge check derives from it. */
export function getBridgeCapabilities(model?: string | null): BridgeCapabilities | undefined {
  if (/^gpt-codex(?:-fast|-deep)?$/.test(model ?? '')) return CODEX;
  if (/^claude-max(?:-fast|-deep)?$/.test(model ?? '')) return CLAUDE;
  return undefined;
}

export function isBridgeModel(model?: string | null): boolean {
  return getBridgeCapabilities(model) !== undefined;
}

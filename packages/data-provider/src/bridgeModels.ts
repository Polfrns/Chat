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
  supportsWebSearch: false,
};

export function getBridgeCapabilities(model?: string | null): BridgeCapabilities | undefined {
  if (/^gpt-codex(?:-fast|-deep)?$/.test(model ?? '')) return CODEX;
  if (/^claude-max(?:-fast|-deep)?$/.test(model ?? '')) return CLAUDE;
  return undefined;
}

import React, { useRef, useState, useMemo, useCallback } from 'react';
import { useRecoilState } from 'recoil';
import * as Ariakit from '@ariakit/react';
import {
  FileSearch,
  ImageUpIcon,
  FileType2Icon,
  FileImageIcon,
  TerminalSquareIcon,
} from 'lucide-react';
import {
  IconButton,
  FileUpload,
  TooltipAnchor,
  DropdownPopup,
  AttachmentIcon,
  SharePointIcon,
} from '@librechat/client';
import {
  Providers,
  EToolResources,
  EModelEndpoint,
  isExplicitMimeConfig,
  defaultAgentCapabilities,
  isDocumentSupportedProvider,
} from 'librechat-data-provider';
import type {
  TConversation,
  EndpointFileConfig,
} from 'librechat-data-provider';
import type { ExtendedFile, FileSetter } from '~/common';
import {
  useAgentToolPermissions,
  useAgentCapabilities,
  useGetAgentsConfig,
  useFileHandlingNoChatContext,
  useLocalize,
} from '~/hooks';
import { useSharePointFileHandlingNoChatContext } from '~/hooks/Files/useSharePointFileHandling';
import { useShortcutAriaKey, useShortcutHint } from '~/hooks/useKeyboardShortcuts';
import { SharePointPickerDialog } from '~/components/SharePoint';
import { useGetStartupConfig } from '~/data-provider';
import { ephemeralAgentByConvoId } from '~/store';
import { MenuItemProps } from '~/common';
import { cn } from '~/utils';
import NextcloudPanel from '~/components/Nextcloud/NextcloudPanel';

type FileUploadType =
  | 'image'
  | 'document'
  | 'image_document'
  | 'image_document_extended'
  | 'image_document_video_audio'
  | 'image_document_video_audio_configured';

interface AttachFileMenuProps {
  agentId?: string | null;
  endpoint?: string | null;
  disabled?: boolean | null;
  conversationId: string;
  endpointType?: EModelEndpoint | string;
  endpointFileConfig?: EndpointFileConfig;
  /** Resolved by the parent, which knows whether the file config has landed. */
  isUnifiedMode: boolean;
  useResponsesApi?: boolean;
  files: Map<string, ExtendedFile>;
  setFiles: FileSetter;
  setFilesLoading: React.Dispatch<React.SetStateAction<boolean>>;
  conversation: TConversation | null;
}

const AttachFileMenu = ({
  agentId,
  endpoint,
  disabled,
  endpointType,
  conversationId,
  endpointFileConfig,
  isUnifiedMode,
  useResponsesApi,
  files,
  setFiles,
  setFilesLoading,
  conversation,
}: AttachFileMenuProps) => {
  const localize = useLocalize();
  const isUploadDisabled = disabled ?? false;
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPopoverActive, setIsPopoverActive] = useState(false);
  const uploadFileTooltip = useShortcutHint('uploadFile', localize('com_sidepanel_attach_files'));
  const uploadFileAriaKey = useShortcutAriaKey('uploadFile');
  const [ephemeralAgent, setEphemeralAgent] = useRecoilState(
    ephemeralAgentByConvoId(conversationId),
  );
  const toolResourceRef = useRef<EToolResources | undefined>();
  const { handleFileChange, handleFiles } = useFileHandlingNoChatContext(undefined, {
    files,
    setFiles,
    setFilesLoading,
    conversation,
  });
  const { handleSharePointFiles, isProcessing, downloadProgress } =
    useSharePointFileHandlingNoChatContext(
      { toolResource: toolResourceRef.current },
      { files, setFiles, setFilesLoading, conversation },
    );

  const { agentsConfig } = useGetAgentsConfig();
  const { data: startupConfig } = useGetStartupConfig();
  const sharePointEnabled = startupConfig?.sharePointFilePickerEnabled;

  const [isSharePointDialogOpen, setIsSharePointDialogOpen] = useState(false);

  /** TODO: Ephemeral Agent Capabilities
   * Allow defining agent capabilities on a per-endpoint basis
   * Use definition for agents endpoint for ephemeral agents
   * */
  const capabilities = useAgentCapabilities(agentsConfig?.capabilities ?? defaultAgentCapabilities);

  const { fileSearchAllowedByAgent, codeAllowedByAgent, provider } = useAgentToolPermissions(
    agentId,
    ephemeralAgent,
  );

  const handleUploadClick = useCallback((_fileType?: FileUploadType) => {
    if (!inputRef.current) {
      return;
    }
    inputRef.current.value = '';
    // The native picker shows all files; upload validation applies endpoint limits.
    inputRef.current.accept = '';
    inputRef.current.click();
  }, []);

  /** Unified mode: single click triggers file upload with no tool_resource */
  const handleUnifiedUpload = useCallback(() => {
    toolResourceRef.current = undefined;
    handleUploadClick();
  }, [handleUploadClick]);

  /** Unified mode removed the destination chooser, not the source chooser. SharePoint has
   *  no trigger of its own, so without this the picker becomes unreachable whenever the
   *  composer is in unified mode. Destination stays implicit on both sources. */
  const unifiedSourceItems = useMemo<MenuItemProps[]>(
    () => [
      {
        label: localize('com_files_upload_local_machine'),
        onClick: handleUnifiedUpload,
        icon: <FileImageIcon className="icon-md" />,
      },
      {
        label: localize('com_files_upload_sharepoint'),
        onClick: () => {
          toolResourceRef.current = undefined;
          setIsSharePointDialogOpen(true);
        },
        icon: <SharePointIcon className="icon-md" />,
      },
    ],
    [localize, handleUnifiedUpload, setIsSharePointDialogOpen],
  );

  const dropdownItems = useMemo(() => {
    const setToolResource = (value: EToolResources | undefined) => {
      toolResourceRef.current = value;
    };

    const createMenuItems = (onAction: (fileType?: FileUploadType) => void) => {
      const items: MenuItemProps[] = [];

      let currentProvider = provider || endpoint;

      // This will be removed in a future PR to formally normalize Providers comparisons to be case insensitive
      if (currentProvider?.toLowerCase() === Providers.OPENROUTER) {
        currentProvider = Providers.OPENROUTER;
      }

      const isAzureWithResponsesApi =
        (currentProvider === EModelEndpoint.azureOpenAI ||
          endpointType === EModelEndpoint.azureOpenAI) &&
        useResponsesApi === true;

      if (
        isDocumentSupportedProvider(endpointType) ||
        isDocumentSupportedProvider(currentProvider) ||
        isAzureWithResponsesApi
      ) {
        items.push({
          label: localize('com_ui_upload_provider'),
          onClick: () => {
            setToolResource(undefined);
            let fileType: Exclude<FileUploadType, 'image' | 'document'> = 'image_document';
            if (currentProvider === Providers.GOOGLE || currentProvider === Providers.OPENROUTER) {
              fileType = 'image_document_video_audio';
            } else if (
              currentProvider === Providers.BEDROCK ||
              endpointType === EModelEndpoint.bedrock
            ) {
              fileType = 'image_document_extended';
            } else if (
              endpointType === EModelEndpoint.custom &&
              isExplicitMimeConfig(endpointFileConfig?.supportedMimeTypes)
            ) {
              fileType = 'image_document_video_audio_configured';
            }
            onAction(fileType);
          },
          icon: <FileImageIcon className="icon-md" />,
        });
      } else {
        items.push({
          label: localize('com_ui_upload_image_input'),
          onClick: () => {
            setToolResource(undefined);
            onAction('image');
          },
          icon: <ImageUpIcon className="icon-md" />,
        });
      }

      if (capabilities.contextEnabled) {
        items.push({
          label: localize('com_ui_upload_ocr_text'),
          onClick: () => {
            setToolResource(EToolResources.context);
            onAction();
          },
          icon: <FileType2Icon className="icon-md" />,
        });
      }

      if (capabilities.fileSearchEnabled && fileSearchAllowedByAgent) {
        items.push({
          label: localize('com_ui_upload_file_search'),
          onClick: () => {
            setToolResource(EToolResources.file_search);
            setEphemeralAgent((prev) => ({
              ...prev,
              [EToolResources.file_search]: true,
            }));
            onAction();
          },
          icon: <FileSearch className="icon-md" />,
        });
      }

      if (capabilities.codeEnabled && codeAllowedByAgent) {
        items.push({
          label: localize('com_ui_upload_code_environment'),
          onClick: () => {
            setToolResource(EToolResources.execute_code);
            setEphemeralAgent((prev) => ({
              ...prev,
              [EToolResources.execute_code]: true,
            }));
            onAction();
          },
          icon: <TerminalSquareIcon className="icon-md" />,
        });
      }

      return items;
    };

    const localItems = createMenuItems(handleUploadClick);

    if (sharePointEnabled) {
      const sharePointItems = createMenuItems(() => {
        setIsSharePointDialogOpen(true);
        // Note: toolResource will be set by the specific item clicked
      });
      localItems.push({
        label: localize('com_files_upload_sharepoint'),
        onClick: () => {},
        icon: <SharePointIcon className="icon-md" />,
        subItems: sharePointItems,
      });
      return localItems;
    }

    return localItems;
  }, [
    localize,
    endpoint,
    provider,
    endpointType,
    capabilities,
    useResponsesApi,
    handleUploadClick,
    setEphemeralAgent,
    sharePointEnabled,
    endpointFileConfig?.supportedMimeTypes,
    codeAllowedByAgent,
    fileSearchAllowedByAgent,
    setIsSharePointDialogOpen,
  ]);

  const menuTrigger = (
    <TooltipAnchor
      render={
        <Ariakit.MenuButton
          disabled={isUploadDisabled}
          id="attach-file-menu-button"
          aria-label="Attach File Options"
          aria-keyshortcuts={uploadFileAriaKey}
          className={cn(
            'flex size-theme-control items-center justify-center rounded-theme-control-round p-1 transition-colors duration-theme-fast hover:bg-surface-composer-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-opacity-50',
            isPopoverActive && 'bg-surface-composer-hover',
          )}
        >
          <div className="flex w-full items-center justify-center gap-2">
            <AttachmentIcon />
          </div>
        </Ariakit.MenuButton>
      }
      id="attach-file-menu-button"
      description={uploadFileTooltip}
      disabled={isUploadDisabled}
    />
  );
  const handleSharePointFilesSelected = async (sharePointFiles: any[]) => {
    try {
      await handleSharePointFiles(sharePointFiles);
      setIsSharePointDialogOpen(false);
    } catch (error) {
      console.error('SharePoint file processing error:', error);
    }
  };

  if (isUnifiedMode) {
    return (
      <>
        <FileUpload
          ref={inputRef}
          handleFileChange={(e) => {
            handleFileChange(e, toolResourceRef.current);
          }}
        >
          {sharePointEnabled === true ? (
            <DropdownPopup
              menuId="attach-file-menu"
              className="overflow-visible"
              isOpen={isPopoverActive}
              setIsOpen={setIsPopoverActive}
              modal={false}
              portal={true}
              unmountOnHide={true}
              trigger={menuTrigger}
              items={unifiedSourceItems}
              iconClassName="mr-0"
            />
          ) : (
            <TooltipAnchor
              render={
                <IconButton
                  type="button"
                  size="theme"
                  shape="theme"
                  disabled={isUploadDisabled}
                  id="attach-file-button"
                  label={localize('com_sidepanel_attach_files')}
                  onClick={handleUnifiedUpload}
                  aria-keyshortcuts={uploadFileAriaKey}
                  className="p-1 hover:bg-surface-composer-hover"
                >
                  <AttachmentIcon />
                </IconButton>
              }
              id="attach-file-button"
              description={uploadFileTooltip}
              disabled={isUploadDisabled}
            />
          )}
        </FileUpload>
        <SharePointPickerDialog
          isOpen={isSharePointDialogOpen}
          onOpenChange={setIsSharePointDialogOpen}
          onFilesSelected={handleSharePointFilesSelected}
          isDownloading={isProcessing}
          downloadProgress={downloadProgress}
          maxSelectionCount={endpointFileConfig?.fileLimit}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <NextcloudPanel
          conversationId={conversationId}
          disabled={isUploadDisabled}
          onAttach={async (selected) => {
            await handleFiles(selected);
          }}
        />
        <FileUpload
          ref={inputRef}
          handleFileChange={(e) => {
            handleFileChange(e, toolResourceRef.current);
            toolResourceRef.current = undefined;
          }}
        >
          <DropdownPopup
            menuId="attach-file-menu"
            className="overflow-visible"
            isOpen={isPopoverActive}
            setIsOpen={setIsPopoverActive}
            modal={false}
            portal={true}
            unmountOnHide={true}
            trigger={menuTrigger}
            items={dropdownItems}
            iconClassName="mr-0"
          />
        </FileUpload>
      </div>
      <SharePointPickerDialog
        isOpen={isSharePointDialogOpen}
        onOpenChange={setIsSharePointDialogOpen}
        onFilesSelected={handleSharePointFilesSelected}
        isDownloading={isProcessing}
        downloadProgress={downloadProgress}
        maxSelectionCount={endpointFileConfig?.fileLimit}
      />
    </>
  );
};

export default React.memo(AttachFileMenu);

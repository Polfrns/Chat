import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Cloud, Folder, FileText } from 'lucide-react';
import {
  OGDialog,
  OGDialogTitle,
  OGDialogContent,
  OGDialogPortal,
  OGDialogOverlay,
} from '@librechat/client';
import type { NextcloudEntry, NextcloudProposal } from 'librechat-data-provider';
import { nextcloud } from '~/data-provider/Nextcloud';
import { useAuthContext } from '~/hooks/AuthContext';

interface NextcloudPanelProps {
  conversationId: string;
  onAttach: (files: File[]) => Promise<void>;
  disabled?: boolean;
}

interface WriteProposalProps {
  proposal: NextcloudProposal;
  onDecision: (id: string, approve: boolean) => Promise<void>;
}

function WriteProposal({ proposal, onDecision }: WriteProposalProps) {
  const [busy, setBusy] = useState(false);
  const decide = async (approve: boolean) => {
    setBusy(true);
    try { await onDecision(proposal.id, approve); } finally { setBusy(false); }
  };
  return (
    <section className="space-y-2 rounded-lg border border-border-medium p-3">
      <p className="break-all font-semibold">{proposal.mode === 'replace' ? 'Reemplazar original' : 'Guardar una copia'}: {proposal.path}</p>
      <p className="text-sm text-text-secondary">{proposal.bytes} bytes · requiere tu permiso</p>
      {proposal.before != null && <details><summary>Contenido actual</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs">{proposal.before}</pre></details>}
      {proposal.after != null && <details open><summary>Contenido propuesto</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs">{proposal.after}</pre></details>}
      {proposal.after == null && <p className="text-sm">Archivo del chat: {proposal.sourceName}. No hay una vista previa de sus cambios.</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void decide(true)}>Aprobar escritura</button>
        <button className="btn btn-neutral" type="button" disabled={busy} onClick={() => void decide(false)}>Rechazar</button>
      </div>
    </section>
  );
}

interface NextcloudFilesProps {
  entries: NextcloudEntry[];
  busy: boolean;
  onDirectory: (path: string) => void;
  onAttach: (entry: NextcloudEntry) => Promise<void>;
}

function NextcloudFiles({ entries, busy, onDirectory, onAttach }: NextcloudFilesProps) {
  return (
    <ul className="space-y-1">
      {entries.map((entry) => (
        <li key={entry.path}>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded p-2 text-left hover:bg-surface-hover"
            disabled={busy}
            onClick={() => entry.directory ? onDirectory(entry.path) : void onAttach(entry)}
          >
            {entry.directory
              ? <Folder className="size-4 shrink-0" />
              : <FileText className="size-4 shrink-0" />}
            <span className="break-all">{entry.name}</span>
            {!entry.directory && <span className="ml-auto text-xs">Adjuntar</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function NextcloudPanel({ conversationId, onAttach, disabled }: NextcloudPanelProps) {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState('');
  const [loginUrl, setLoginUrl] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const cache = useQueryClient();
  const { user } = useAuthContext();
  const owner = user?.id ?? '';
  const status = useQuery(['nextcloud', owner, 'status'], nextcloud.status, { enabled: !!owner, retry: false });
  const enabled = status.data?.enabled === true;
  const connected = status.data?.connected === true;
  const files = useQuery(['nextcloud', owner, 'files', path], () => nextcloud.list(path), { enabled: open && connected, retry: false });
  const proposals = useQuery(['nextcloud', owner, 'proposals', conversationId], () => nextcloud.pending(conversationId), {
    enabled: enabled && connected && !!conversationId,
    refetchInterval: 3000,
    retry: false,
  });
  const pending = proposals.data?.proposals ?? [];
  const [seen, setSeen] = useState<string[]>([]);
  useEffect(() => {
    const ids = proposals.data?.proposals.map((proposal) => proposal.id) ?? [];
    if (ids.some((id) => !seen.includes(id))) { setSeen((previous) => [...previous, ...ids]); setOpen(true); }
  }, [proposals.data, seen]);

  useEffect(() => {
    if (!loginUrl) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const expires = Date.now() + 20 * 60 * 1000;
    const poll = async () => {
      try {
        const result = await nextcloud.poll();
        if (disposed) return;
        if (result.connected) {
          setLoginUrl('');
          setPath('');
          await cache.invalidateQueries(['nextcloud']);
          return;
        }
        if (Date.now() >= expires) throw new Error('expired');
        timer = setTimeout(poll, 2000);
      } catch { if (!disposed) { setError('No se completó la vinculación. Vuelve a intentarlo.'); setLoginUrl(''); } }
    };
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [loginUrl, cache]);

  const connect = async () => {
    setError('');
    setBusy(true);
    try {
      const result = await nextcloud.connect();
      setLoginUrl(result.login);
      window.open(result.login, '_blank', 'noopener,noreferrer');
    } catch { setError('No se pudo conectar con Nextcloud.'); }
    finally { setBusy(false); }
  };
  const attach = async (entry: NextcloudEntry) => {
    setBusy(true);
    setError('');
    try { await onAttach([await nextcloud.download(entry)]); setNotice(`Archivo enviado para adjuntar: ${entry.path}`); }
    catch { setError('No se pudo adjuntar el archivo. Comprueba los permisos y el límite de tamaño.'); }
    finally { setBusy(false); }
  };
  const decide = async (id: string, approve: boolean) => {
    setError('');
    try {
      await nextcloud.decide(id, approve);
      setNotice(approve ? 'Archivo guardado en Nextcloud.' : 'Escritura rechazada.');
    } catch { setError('No se pudo guardar: el archivo puede haber cambiado o el permiso haber caducado.'); }
    finally { await cache.invalidateQueries(['nextcloud']); }
  };
  const disconnect = async () => {
    setBusy(true);
    try {
      const result = await nextcloud.disconnect();
      setLoginUrl('');
      setPath('');
      cache.removeQueries(['nextcloud', owner, 'files']);
      cache.removeQueries(['nextcloud', owner, 'proposals']);
      await cache.invalidateQueries(['nextcloud', owner, 'status']);
      setNotice(result.revocationFailed ? 'Desvinculado de Roko. Revoca también la credencial Roko desde la seguridad de Nextcloud.' : 'Cuenta desvinculada.');
    } catch { setError('No se pudo desvincular la cuenta.'); }
    finally { setBusy(false); }
  };

  if (status.isError) return <span role="status" className="text-xs text-text-secondary">Nextcloud no disponible</span>;
  if (!enabled) return null;
  return (
    <>
      <button
        type="button"
        aria-label="Nextcloud"
        title="Nextcloud"
        className="flex size-9 items-center justify-center rounded-full hover:bg-surface-hover"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Cloud className="size-5" />
      </button>
      <OGDialog open={open} onOpenChange={setOpen}>
        <OGDialogPortal>
        <OGDialogOverlay className="bg-black/50" />
        <OGDialogContent className="max-h-[85vh] w-full max-w-2xl overflow-auto bg-surface-primary p-5" showCloseButton>
          <OGDialogTitle>Nextcloud</OGDialogTitle>
          <div className="mt-4 space-y-4">
            {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
            {notice && <p role="status" className="text-sm">{notice}</p>}
            {connected ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span>Cuenta: {status.data?.username}</span>
                  <button type="button" className="btn btn-neutral" disabled={busy} onClick={() => void disconnect()}>
                    Desvincular
                  </button>
                </div>
                {pending.map((proposal) => <WriteProposal key={proposal.id} proposal={proposal} onDecision={decide} />)}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-neutral"
                    disabled={!path}
                    onClick={() => setPath(path.split('/').slice(0, -1).join('/'))}
                  >
                    Subir carpeta
                  </button>
                  <span className="break-all">/{path}</span>
                </div>
                {files.isLoading && <p>Cargando archivos…</p>}
                {files.isError && <p role="alert">No se pudo abrir esta carpeta.</p>}
                {files.data?.files.length === 0 && <p>Carpeta vacía.</p>}
                <NextcloudFiles entries={files.data?.files ?? []} busy={busy} onDirectory={setPath} onAttach={attach} />
                <p className="text-xs text-text-secondary">Puedes pedir en el chat que guarde una copia o proponga cambios en un original. Cada escritura aparecerá aquí para tu aprobación.</p>
              </>
            ) : <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void connect()}>Vincular mi cuenta de Nextcloud</button>}
            {loginUrl && <a className="block underline" href={loginUrl} target="_blank" rel="noopener noreferrer">Autorizar el acceso en Nextcloud</a>}
          </div>
        </OGDialogContent>
        </OGDialogPortal>
      </OGDialog>
    </>
  );
}

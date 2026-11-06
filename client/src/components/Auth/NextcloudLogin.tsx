import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiBaseUrl, request } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

interface LoginResult {
  connected?: boolean;
  token?: string;
  twoFAPending?: boolean;
  tempToken?: string;
}

export default function NextcloudLogin() {
  const [loginUrl, setLoginUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const localize = useLocalize();
  const base = `${apiBaseUrl()}/api/auth/nextcloud`;

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const result: { login: string } = await request.post(`${base}/start`);
      setLoginUrl(result.login);
      window.open(result.login, '_blank', 'noopener,noreferrer');
    } catch {
      setError(localize('com_roko_nextcloud_login_start_error'));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!loginUrl) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const expires = Date.now() + 20 * 60 * 1000;
    const poll = async () => {
      try {
        const result: LoginResult = await request.post(`${base}/poll`);
        if (disposed) return;
        if (result.twoFAPending && result.tempToken) {
          navigate(`/login/2fa?tempToken=${encodeURIComponent(result.tempToken)}`);
          return;
        }
        if (result.token) {
          window.location.assign(`${apiBaseUrl()}/c/new`);
          return;
        }
        if (Date.now() >= expires) throw new Error('expired');
        timer = setTimeout(poll, 2000);
      } catch {
        if (!disposed) {
          setError(localize('com_roko_nextcloud_login_incomplete'));
          setLoginUrl('');
        }
      }
    };
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [loginUrl, base, navigate, localize]);

  return (
    <div className="my-4 flex flex-col gap-2">
      <button className="btn btn-neutral w-full" type="button" disabled={busy} onClick={start}>
        {localize('com_roko_nextcloud_login_button')}
      </button>
      {loginUrl && (
        <a
          className="text-center underline"
          href={loginUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {localize('com_roko_nextcloud_login_continue')}
        </a>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}

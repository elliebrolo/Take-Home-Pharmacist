import React, { useEffect, useState } from 'react';
import { apiFetch, apiUrl, usesBearer } from '../utils/api';

type Props = React.ImgHTMLAttributes<HTMLImageElement> & { src: string };

/**
 * An <img> for pictures served by our own server (/uploads/..., /nlm-images/...), which are behind sign-in.
 *  - Same origin (web): a plain <img>; the browser sends the cookie.
 *  - Native app: an <img> cannot send an Authorization header, so the picture is fetched with the token and shown
 *    from a temporary in-memory URL.
 * Pictures on other sites (DailyMed) are always shown directly.
 */
export const ApiImage: React.FC<Props> = ({ src, onError, ...rest }) => {
  const ours = src.startsWith('/');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!ours || !usesBearer()) return;
    let revoked: string | null = null;
    let cancelled = false;
    apiFetch(src)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((b) => {
        if (cancelled) return;
        revoked = URL.createObjectURL(b);
        setBlobUrl(revoked);
      })
      .catch(() => {
        if (!cancelled) onError?.({} as React.SyntheticEvent<HTMLImageElement, Event>);
      });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, ours]);

  if (ours && usesBearer()) return blobUrl ? <img src={blobUrl} onError={onError} {...rest} /> : null;
  return <img src={ours ? apiUrl(src) : src} onError={onError} {...rest} />;
};

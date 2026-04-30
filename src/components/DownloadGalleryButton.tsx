import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { downloadGalleryAsZip } from "../lib/zip";
import type { Gallery } from "../types";

interface Props {
  gallery: Gallery;
}

export function DownloadGalleryButton({ gallery }: Props) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });

  const handle = async () => {
    if (busy) return;
    setBusy(true);
    setProgress({ loaded: 0, total: gallery.images.length });
    try {
      await downloadGalleryAsZip(gallery, (loaded, total) =>
        setProgress({ loaded, total })
      );
    } catch (err) {
      console.error(err);
      alert("Failed to download gallery. See console for details.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handle}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-800 disabled:opacity-60"
    >
      {busy ? (
        <>
          <Loader2 size={16} className="animate-spin" />
          Zipping {progress.loaded}/{progress.total}
        </>
      ) : (
        <>
          <Download size={16} />
          Download all ({gallery.images.length})
        </>
      )}
    </button>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Pause,
  Play,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from "lucide-react";
import type { GalleryImage } from "../types";
import { viewUrl } from "../lib/storage";
import { downloadSingleImage } from "../lib/zip";

interface Props {
  images: GalleryImage[];
  index: number | null;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

const AUTOPLAY_DEFAULT_MS = 4000;

export function ImageDialog({ images, index, onClose, onIndexChange }: Props) {
  const open = index !== null;
  const current = index !== null ? images[index] : null;
  const [autoplay, setAutoplay] = useState(false);
  const [intervalMs, setIntervalMs] = useState(AUTOPLAY_DEFAULT_MS);
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);

  const goPrev = () => {
    if (index === null) return;
    onIndexChange((index - 1 + images.length) % images.length);
  };
  const goNext = () => {
    if (index === null) return;
    onIndexChange((index + 1) % images.length);
  };

  useEffect(() => {
    transformRef.current?.resetTransform();
  }, [index]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === " ") {
        e.preventDefault();
        setAutoplay((a) => !a);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, images.length]);

  useEffect(() => {
    if (!open || !autoplay) return;
    const id = window.setInterval(goNext, intervalMs);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoplay, intervalMs, index, images.length]);

  const preload = useMemo(() => {
    if (index === null) return [];
    const next = images[(index + 1) % images.length];
    const prev = images[(index - 1 + images.length) % images.length];
    return [next, prev].filter(Boolean);
  }, [index, images]);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed inset-0 z-50 flex flex-col outline-none"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">
            {current?.filename || "Image"}
          </Dialog.Title>

          <div className="flex items-center justify-between gap-2 border-b border-neutral-800 bg-neutral-950/80 px-4 py-2 text-sm">
            <div className="min-w-0 flex-1 truncate text-neutral-200">
              {current?.filename}
              {index !== null && (
                <span className="ml-2 text-neutral-500">
                  {index + 1}/{images.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => transformRef.current?.zoomOut()}
                className="rounded p-2 text-neutral-300 hover:bg-neutral-800"
                aria-label="Zoom out"
              >
                <ZoomOut size={16} />
              </button>
              <button
                type="button"
                onClick={() => transformRef.current?.zoomIn()}
                className="rounded p-2 text-neutral-300 hover:bg-neutral-800"
                aria-label="Zoom in"
              >
                <ZoomIn size={16} />
              </button>
              <button
                type="button"
                onClick={() => transformRef.current?.resetTransform()}
                className="rounded p-2 text-neutral-300 hover:bg-neutral-800"
                aria-label="Reset zoom"
              >
                <RotateCcw size={16} />
              </button>
              <button
                type="button"
                onClick={() => setAutoplay((a) => !a)}
                className="rounded p-2 text-neutral-300 hover:bg-neutral-800"
                aria-label={autoplay ? "Pause slideshow" : "Play slideshow"}
              >
                {autoplay ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <select
                value={intervalMs}
                onChange={(e) => setIntervalMs(Number(e.target.value))}
                className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
                aria-label="Slideshow interval"
              >
                <option value={2000}>2s</option>
                <option value={4000}>4s</option>
                <option value={6000}>6s</option>
                <option value={10000}>10s</option>
              </select>
              <button
                type="button"
                onClick={() => current && downloadSingleImage(current)}
                className="rounded p-2 text-neutral-300 hover:bg-neutral-800"
                aria-label="Download image"
              >
                <Download size={16} />
              </button>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded p-2 text-neutral-300 hover:bg-neutral-800"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>
          </div>

          <div className="relative flex flex-1 items-center justify-center overflow-hidden">
            {current && (
              <TransformWrapper
                ref={transformRef}
                doubleClick={{ mode: "toggle" }}
                wheel={{ step: 0.2 }}
                minScale={1}
                maxScale={8}
                centerOnInit
                limitToBounds
              >
                <TransformComponent
                  wrapperClass="!w-full !h-full"
                  contentClass="!w-full !h-full flex items-center justify-center"
                >
                  <img
                    src={viewUrl(current)}
                    alt={current.filename}
                    className="max-h-full max-w-full select-none object-contain"
                    draggable={false}
                  />
                </TransformComponent>
              </TransformWrapper>
            )}

            <button
              type="button"
              onClick={goPrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-neutral-200 hover:bg-black/70"
              aria-label="Previous image"
            >
              <ChevronLeft size={24} />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-neutral-200 hover:bg-black/70"
              aria-label="Next image"
            >
              <ChevronRight size={24} />
            </button>

            <div aria-hidden className="hidden">
              {preload.map((img) => (
                <img key={img.src} src={viewUrl(img)} alt="" />
              ))}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

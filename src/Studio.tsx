import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type ChangeEvent,
} from "react";
import {
  DEFAULT_MOTION,
  DEFAULT_OUTPUT,
  type ImageLayer,
  type MotionSettings,
  type OutputSettings,
  type SceneImages,
} from "./engine/types";
import { assignStarLayers } from "./engine/layers";
import { StarfieldRenderer } from "./engine/renderer";
import { exportMp4, getOutputDimensions } from "./engine/export";
import { copy, errorText, type Messages } from "./i18n";
import { Icon } from "./Icon";
import { isPlaybackShortcut, wheelZoom } from "./player-controls";

type Kind = "starless" | "stars";
type Layers = Record<Kind, ImageLayer | null>;
const emptyLayers: Layers = { starless: null, stars: null };
const accept =
  ".tif,.tiff,.png,.jpg,.jpeg,.webp,image/tiff,image/png,image/jpeg,image/webp";
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

type StudioProps = {
  active: boolean;
  language: "pl" | "en";
  onExportingChange: (exporting: boolean) => void;
};

function Thumbnail({ image }: { image: ImageLayer }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const source = new OffscreenCanvas(image.width, image.height);
    source
      .getContext("2d")!
      .putImageData(
        new ImageData(
          new Uint8ClampedArray(image.pixels),
          image.width,
          image.height,
        ),
        0,
        0,
      );
    c.width = 160;
    c.height = 120;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#090b0f";
    ctx.fillRect(0, 0, 160, 120);
    const scale = Math.min(160 / image.width, 120 / image.height);
    ctx.drawImage(
      source,
      (160 - image.width * scale) / 2,
      (120 - image.height * scale) / 2,
      image.width * scale,
      image.height * scale,
    );
  }, [image]);
  return <canvas ref={ref} className="thumbnail" aria-hidden="true" />;
}

function ImageInput({
  kind,
  image,
  busy,
  disabled,
  error,
  m,
  onFile,
  onRemove,
}: {
  kind: Kind;
  image: ImageLayer | null;
  busy: boolean;
  disabled: boolean;
  error: string;
  m: Messages;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const title = kind === "starless" ? m.starless : m.stars;
  const choose = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
    e.target.value = "";
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };
  const content = image ? (
    <>
      <Thumbnail image={image} />
      <span className="file-details">
        <strong title={image.name}>{image.name}</strong>
        <span>
          {image.originalWidth} × {image.originalHeight} · {image.bitDepth}-bit
        </span>
        {image.originalWidth !== image.width && (
          <small>
            {m.downsampled}: {image.width} × {image.height}
          </small>
        )}
        <span className="replace-label">
          <Icon name="upload" size={13} />
          {m.replace}
        </span>
      </span>
    </>
  ) : (
    <>
      <span className={`upload-symbol ${busy ? "spinning" : ""}`}>
        <Icon name={busy ? "orbit" : "upload"} size={22} />
      </span>
      <span>{busy ? m.processing : m.choose}</span>
      <small>{m.formats}</small>
    </>
  );

  return (
    <article
      className={`image-input ${image ? "loaded" : ""} ${dragging ? "dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
    >
      <div className="image-input-heading">
        <span className={`layer-icon ${kind}`}>
          <Icon name={kind === "stars" ? "star" : "image"} size={18} />
        </span>
        <div>
          <h3>{title}</h3>
          <p>{kind === "starless" ? m.starlessHelp : m.starsHelp}</p>
        </div>
        {image && (
          <button
            type="button"
            className="icon-button remove"
            disabled={disabled}
            aria-label={`${m.remove}: ${title}`}
            onClick={onRemove}
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </div>
      <input
        ref={ref}
        type="file"
        accept={accept}
        aria-label={title}
        onChange={choose}
        disabled={disabled}
        className="file-input"
      />
      <button
        type="button"
        className={`drop-zone ${image ? "has-image" : ""}`}
        disabled={disabled}
        onClick={() => ref.current?.click()}
        aria-label={`${image ? m.replace : m.choose}: ${title}`}
      >
        {content}
      </button>
      {error && (
        <p className="input-error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  display,
  help,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display: string;
  help?: string;
  onChange: (n: number) => void;
}) {
  return (
    <label className="slider-control">
      <span className="control-label">
        <span>{label}</span>
        <output>{display}</output>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={
          {
            "--fill": `${((value - min) / (max - min)) * 100}%`,
          } as CSSProperties
        }
      />
      {help && <span className="control-help">{help}</span>}
    </label>
  );
}

export default function Studio({
  active,
  language,
  onExportingChange,
}: StudioProps) {
  const m = copy[language];
  const [layers, setLayers] = useState<Layers>(emptyLayers);
  const [loading, setLoading] = useState({ starless: false, stars: false });
  const [uploadErrors, setUploadErrors] = useState({ starless: "", stars: "" });
  const [motion, setMotion] = useState<MotionSettings>({ ...DEFAULT_MOTION });
  const [output, setOutput] = useState<OutputSettings>({ ...DEFAULT_OUTPUT });
  const [tab, setTab] = useState<"motion" | "output">("motion");
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewerZoom, setViewerZoom] = useState(1);
  const [fullscreenError, setFullscreenError] = useState(false);
  const [renderError, setRenderError] = useState("");
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [cancelled, setCancelled] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<StarfieldRenderer | null>(null);
  const activeRef = useRef(active);
  const workers = useRef<Record<Kind, Worker | null>>({
    stars: null,
    starless: null,
  });
  const latest = useRef({ starless: 0, stars: 0 });
  const counter = useRef(0);
  const progressRef = useRef(0);
  const motionRef = useRef(motion);
  const exportController = useRef<AbortController | null>(null);
  activeRef.current = active;
  motionRef.current = motion;
  const busy = loading.stars || loading.starless;
  const mismatched = !!(
    layers.starless &&
    layers.stars &&
    (layers.starless.originalWidth !== layers.stars.originalWidth ||
      layers.starless.originalHeight !== layers.stars.originalHeight)
  );
  const scene = useMemo<SceneImages | null>(
    () =>
      layers.starless && layers.stars && !mismatched
        ? { starless: layers.starless, stars: layers.stars }
        : null,
    [layers, mismatched],
  );
  const layerDistribution = useMemo(
    () =>
      scene
        ? assignStarLayers(scene.stars.stars, motion.layerCount).counts
        : [],
    [scene?.stars.stars, motion.layerCount],
  );
  const maxLayerPopulation = layerDistribution.reduce(
    (max, count) => Math.max(max, count),
    1,
  );
  const noStars = !!scene && scene.stars.stars.length === 0;
  const duration = scene ? output.duration : 10;
  const dimensions = scene
    ? getOutputDimensions(
        scene.starless.originalWidth,
        scene.starless.originalHeight,
        output.height,
      )
    : null;
  const previewImage = scene?.starless ?? layers.starless ?? layers.stars;
  const aspect = previewImage
    ? previewImage.originalWidth / previewImage.originalHeight
    : 1;
  const canExport = !!scene && !noStars && !busy && !renderError && !exporting;
  const setParam = <K extends keyof MotionSettings>(
    key: K,
    value: MotionSettings[K],
  ) => setMotion((prev) => ({ ...prev, [key]: value }));
  const setOut = <K extends keyof OutputSettings>(
    key: K,
    value: OutputSettings[K],
  ) => setOutput((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    const syncFullscreen = () => {
      const active = document.fullscreenElement === playerRef.current;
      setIsFullscreen(active);
      setViewerZoom(1);
      setFullscreenError(false);
      if (active) playerRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);
  useEffect(() => setViewerZoom(1), [scene]);
  useEffect(() => {
    if (!activeRef.current) {
      setPlaying(false);
      setPosition(progressRef.current);
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!activeRef.current || !scene || exporting || renderError) return;
      if (!isPlaybackShortcut(event)) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        if (
          target.isContentEditable ||
          target.closest('[contenteditable="true"]')
        ) return;
        if (target.closest("button, a, summary")) return;
        if (target.tagName === "INPUT" && (target as HTMLInputElement).type !== "range") return;
        if (["TEXTAREA", "SELECT"].includes(target.tagName)) return;
      }
      event.preventDefault();
      togglePlay();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [active, playing, scene, renderError, exporting]);
  useEffect(() => {
    const stage = stageRef.current;
    if (!activeRef.current || !isFullscreen || !scene || exporting || !stage) return;
    const handleWheel = (event: WheelEvent) => {
      if (!activeRef.current) return;
      event.preventDefault();
      setViewerZoom((current) =>
        wheelZoom(current, event.deltaY, event.deltaMode, stage.clientHeight),
      );
    };
    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => stage.removeEventListener("wheel", handleWheel);
  }, [active, isFullscreen, scene, exporting]);
  useEffect(() => () => cancelLayerWork(), []);
  useEffect(
    () => () => {
      exportController.current?.abort();
    },
    [],
  );
  useEffect(
    () => () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    },
    [downloadUrl],
  );
  useEffect(() => {
    setDownloadUrl("");
    setCancelled(false);
  }, [motion, output]);
  useEffect(() => {
    setPlaying(false);
    setPosition(0);
    progressRef.current = 0;
    setRenderError("");
  }, [scene]);
  useEffect(() => {
    if (!activeRef.current || !scene || !canvasRef.current) return;
    let renderer: StarfieldRenderer | null = null;
    try {
      renderer = new StarfieldRenderer(canvasRef.current, scene);
      rendererRef.current = renderer;
      const width = Math.min(1440, scene.starless.width);
      renderer.resize(
        width,
        Math.round(width / (scene.starless.width / scene.starless.height)),
      );
      renderer.render(progressRef.current, motionRef.current);
    } catch (e) {
      renderer?.dispose();
      rendererRef.current = null;
      setRenderError(e instanceof Error ? e.message : "WEBGL_UNSUPPORTED");
      return;
    }
    return () => {
      rendererRef.current = null;
      renderer?.dispose();
    };
  }, [active, scene]);
  useEffect(() => {
    try {
      rendererRef.current?.render(progressRef.current, motion);
    } catch (e) {
      setRenderError(e instanceof Error ? e.message : "WEBGL_UNSUPPORTED");
      setPlaying(false);
    }
  }, [motion]);
  useEffect(() => {
    if (!activeRef.current || !playing || !scene) return;
    let raf = 0,
      previous = performance.now(),
      lastUpdate = 0;
    const tick = (now: number) => {
      if (!activeRef.current) return;
      const delta = (now - previous) / 1000;
      previous = now;
      progressRef.current = Math.min(
        1,
        progressRef.current + delta / output.duration,
      );
      try {
        rendererRef.current?.render(progressRef.current, motionRef.current);
      } catch (e) {
        setRenderError(e instanceof Error ? e.message : "WEBGL_UNSUPPORTED");
        setPlaying(false);
        return;
      }
      if (now - lastUpdate > 80 || progressRef.current === 1) {
        setPosition(progressRef.current);
        lastUpdate = now;
      }
      if (progressRef.current < 1) raf = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, playing, scene, output.duration]);

  function cancelLayerWork() {
    for (const kind of ["starless", "stars"] as const) {
      latest.current[kind] = ++counter.current;
      workers.current[kind]?.terminate();
      workers.current[kind] = null;
    }
  }
  function loadFile(kind: Kind, file: File) {
    if (exporting) return;
    setViewerZoom(1);
    workers.current[kind]?.terminate();
    const id = ++counter.current;
    latest.current[kind] = id;
    setLoading((prev) => ({ ...prev, [kind]: true }));
    setLayers((prev) => ({ ...prev, [kind]: null }));
    setUploadErrors((prev) => ({ ...prev, [kind]: "" }));
    setExportError("");
    setDownloadUrl("");
    setPlaying(false);
    const worker = new Worker(
      new URL("./engine/processor.worker.ts", import.meta.url),
      { type: "module" },
    );
    workers.current[kind] = worker;
    worker.onmessage = (
      e: MessageEvent<{ id: number; image?: ImageLayer; error?: string }>,
    ) => {
      if (latest.current[kind] !== id || workers.current[kind] !== worker)
        return;
      const { image, error } = e.data;
      setLoading((prev) => ({ ...prev, [kind]: false }));
      if (error) {
        setUploadErrors((prev) => ({ ...prev, [kind]: error }));
      } else if (image) setLayers((prev) => ({ ...prev, [kind]: image }));
      worker.terminate();
      workers.current[kind] = null;
    };
    worker.onerror = () => {
      if (latest.current[kind] !== id || workers.current[kind] !== worker)
        return;
      setUploadErrors((prev) => ({ ...prev, [kind]: "INVALID_IMAGE" }));
      setLoading((prev) => ({ ...prev, [kind]: false }));
      worker.terminate();
      workers.current[kind] = null;
    };
    worker.postMessage({ id, file, kind });
  }
  function removeLayer(kind: Kind) {
    latest.current[kind] = ++counter.current;
    setViewerZoom(1);
    workers.current[kind]?.terminate();
    workers.current[kind] = null;
    setLayers((prev) => ({ ...prev, [kind]: null }));
    setLoading((prev) => ({ ...prev, [kind]: false }));
    setUploadErrors((prev) => ({ ...prev, [kind]: "" }));
    setDownloadUrl("");
  }
  function seek(p: number) {
    setPosition(p);
    progressRef.current = p;
    try {
      rendererRef.current?.render(p, motionRef.current);
    } catch (e) {
      setRenderError(e instanceof Error ? e.message : "WEBGL_UNSUPPORTED");
      setPlaying(false);
    }
  }
  function togglePlay() {
    if (!scene || renderError || exporting) return;
    if (playing) {
      setPlaying(false);
      return;
    }
    if (progressRef.current >= 1) seek(0);
    setPlaying(true);
  }
  function newSession() {
    if (exporting) return;
    cancelLayerWork();
    setViewerZoom(1);
    setPlaying(false);
    seek(0);
    setLayers(emptyLayers);
    setLoading({ starless: false, stars: false });
    setUploadErrors({ starless: "", stars: "" });
    setMotion({ ...DEFAULT_MOTION });
    setOutput({ ...DEFAULT_OUTPUT });
    setRenderError("");
    setExportError("");
    setDownloadUrl("");
    setCancelled(false);
  }
  async function startExport() {
    if (!scene || !canExport) return;
    setPlaying(false);
    setExportError("");
    setCancelled(false);
    setDownloadUrl("");
    setExportProgress(0);
    setExporting(true);
    onExportingChange(true);
    const controller = new AbortController();
    exportController.current = controller;
    try {
      const blob = await exportMp4(
        scene,
        { ...motion },
        { ...output },
        setExportProgress,
        controller.signal,
      );
      if (!controller.signal.aborted) setDownloadUrl(URL.createObjectURL(blob));
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError")
        setCancelled(true);
      else setExportError(e instanceof Error ? e.message : "EXPORT_FAILED");
    } finally {
      setExporting(false);
      onExportingChange(false);
      exportController.current = null;
    }
  }
  function targetClick(e: React.MouseEvent<HTMLDivElement>) {
    if (document.fullscreenElement === playerRef.current) return;
    if (!scene || exporting) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const imageWidth = Math.min(rect.width, rect.height * aspect),
      imageHeight = imageWidth / aspect;
    const imageLeft = rect.left + (rect.width - imageWidth) / 2,
      imageTop = rect.top + (rect.height - imageHeight) / 2;
    if (
      e.clientX < imageLeft ||
      e.clientX > imageLeft + imageWidth ||
      e.clientY < imageTop ||
      e.clientY > imageTop + imageHeight
    )
      return;
    setMotion((prev) => ({
      ...prev,
      focusX: Math.max(0, Math.min(1, (e.clientX - imageLeft) / imageWidth)),
      focusY: Math.max(0, Math.min(1, (e.clientY - imageTop) / imageHeight)),
    }));
  }
  async function toggleFullscreen() {
    setFullscreenError(false);
    try {
      if (document.fullscreenElement === playerRef.current) {
        await document.exitFullscreen();
      } else {
        await playerRef.current?.requestFullscreen();
      }
    } catch {
      setFullscreenError(true);
    }
  }
  const percent = (n: number) => `${Math.round(n * 100)}%`;
  const number = (n: number) =>
    new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(n);
  const idPrefix = "studio";

  return (
    <div className="studio-workspace">
      <div className="page-heading">
          <div>
            <h1>{m.title}</h1>
            <p>{m.intro}</p>
          </div>
          <div className="page-heading-actions">
            <span className={`project-status ${scene ? "is-ready" : ""}`}>
              <span />
              {busy ? m.processing : scene ? m.ready : m.waiting}
            </span>
            <button
              className="quiet-button new-session"
              onClick={newSession}
              disabled={exporting}
              aria-label={m.newSession}
              title={m.newSession}
            >
              <Icon name="reset" size={16} />
              {m.newSession}
            </button>
          </div>
        </div>
        <div className="workspace">
          <div className="composition-column">
            <section
              className="preview-panel"
              aria-label={m.preview}
              style={{ "--scene-aspect": aspect } as CSSProperties}
            >
              <div className="panel-toolbar">
                <div>
                  <span className="live-dot" />
                  <strong>{m.preview}</strong>
                  {scene && (
                    <span className="toolbar-meta">
                      {m.starsCount}: {scene.stars.stars.length}
                    </span>
                  )}
                </div>
                {previewImage && (
                  <span className="toolbar-meta">
                    {previewImage.originalWidth} × {previewImage.originalHeight}
                  </span>
                )}
              </div>
              <div
                className="preview-player"
                ref={playerRef}
                tabIndex={-1}
                role="group"
                aria-label={m.preview}
                style={{ "--viewer-zoom": viewerZoom } as CSSProperties}
              >
                <div className="stage" ref={stageRef}>
                  <div
                    className={`stage-surface ${scene ? "interactive" : ""}`}
                    ref={surfaceRef}
                    onClick={targetClick}
                  >
                    {scene ? (
                      <canvas ref={canvasRef} aria-label={m.preview} />
                    ) : (
                      <div className="empty-state">
                        <Icon name="orbit" size={32} />
                        <p>{busy ? m.processing : m.emptyPreview}</p>
                      </div>
                    )}
                    {scene && (
                      <span
                        className="focus-reticle"
                        aria-hidden="true"
                        style={{
                          left: percent(motion.focusX),
                          top: percent(motion.focusY),
                        }}
                      >
                        <i />
                      </span>
                    )}
                  </div>
                  {renderError && (
                    <div className="stage-error" role="alert">
                      {errorText(renderError, language)}
                    </div>
                  )}
                </div>
                <div className="transport">
                  <button
                    className="play-button"
                    onClick={togglePlay}
                    disabled={!scene || exporting || !!renderError}
                    aria-label={playing ? m.pause : m.play}
                  >
                    <Icon name={playing ? "pause" : "play"} size={18} />
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => {
                      setPlaying(false);
                      seek(0);
                    }}
                    disabled={!scene || exporting}
                    aria-label={m.replay}
                  >
                    <Icon name="reset" size={18} />
                  </button>
                  <span className="timecode">{clock(position * duration)}</span>
                  <input
                    type="range"
                    aria-label={m.timeline}
                    min="0"
                    max="1000"
                    step="1"
                    value={Math.round(position * 1000)}
                    disabled={!scene || exporting}
                    onChange={(e) => seek(Number(e.target.value) / 1000)}
                    style={{ "--fill": `${position * 100}%` } as CSSProperties}
                  />
                  <span className="timecode end-time">{clock(duration)}</span>
                  <button
                    className="icon-button expand-button"
                    aria-label={isFullscreen ? m.exitFullscreen : m.fullscreen}
                    disabled={!scene}
                    onClick={() => void toggleFullscreen()}
                  >
                    <Icon name={isFullscreen ? "close" : "expand"} size={18} />
                  </button>
                  {isFullscreen && (
                    <div className="fullscreen-tools">
                      <div
                        className="viewer-zoom-controls"
                        role="group"
                        aria-label={m.previewZoom}
                      >
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={m.viewerZoomOut}
                          disabled={exporting || viewerZoom <= 1}
                          onClick={() =>
                            setViewerZoom((zoom) => Math.max(1, zoom / 1.25))
                          }
                        >
                          −
                        </button>
                        <button
                          type="button"
                          className="zoom-reset-button"
                          aria-label={m.viewerZoomReset}
                          disabled={exporting || viewerZoom === 1}
                          onClick={() => setViewerZoom(1)}
                        >
                          {Math.round(viewerZoom * 100)}%
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={m.viewerZoomIn}
                          disabled={exporting || viewerZoom >= 4}
                          onClick={() =>
                            setViewerZoom((zoom) => Math.min(4, zoom * 1.25))
                          }
                        >
                          +
                        </button>
                      </div>
                      <span className="fullscreen-hint">
                        {m.fullscreenHint}
                      </span>
                      {fullscreenError && (
                        <span className="fullscreen-error" role="alert">
                          {m.fullscreenError}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {!isFullscreen && fullscreenError && (
                <p className="fullscreen-error" role="alert">
                  {m.fullscreenError}
                </p>
              )}
              <div className="preview-caption">
                <Icon name={scene ? "target" : "image"} size={15} />
                <span>
                  {scene
                    ? m.focusHint
                    : m.emptyPreview}
                </span>
                {scene && (
                  <button
                    disabled={exporting}
                    onClick={() =>
                      setMotion((prev) => ({
                        ...prev,
                        focusX: 0.5,
                        focusY: 0.5,
                      }))
                    }
                  >
                    {m.focusReset}
                  </button>
                )}
              </div>
            </section>
            <section className="sources" aria-labelledby="studio-sources-heading">
              <div className="section-heading">
                <h2 id="studio-sources-heading">{m.images}</h2>
                <span>{m.aligned}</span>
              </div>
              <div className="source-grid">
                {(["starless", "stars"] as const).map((kind) => (
                  <ImageInput
                    key={kind}
                    kind={kind}
                    image={layers[kind]}
                    busy={loading[kind]}
                    disabled={exporting}
                    error={
                      uploadErrors[kind]
                        ? errorText(uploadErrors[kind], language)
                        : ""
                    }
                    m={m}
                    onFile={(file) => loadFile(kind, file)}
                    onRemove={() => removeLayer(kind)}
                  />
                ))}
              </div>
              {mismatched && (
                <p role="alert" className="notice error">
                  {m.mismatch}
                </p>
              )}
              {noStars && (
                <p role="alert" className="notice error">
                  {m.noStars}
                </p>
              )}
            </section>
            <details className="help">
              <summary>{m.help}</summary>
              <p>{m.helpText}</p>
            </details>
          </div>
          <aside className="settings-panel" aria-label={m.settings}>
            <div className="settings-heading">
              <h2>
                <Icon name="sliders" size={18} />
                {m.settings}
              </h2>
              <button
                className="icon-button"
                disabled={!scene || exporting}
                aria-label={m.reset}
                onClick={() => {
                  setMotion({ ...DEFAULT_MOTION });
                  setOutput({ ...DEFAULT_OUTPUT });
                  setExportError("");
                  seek(0);
                }}
              >
                <Icon name="reset" size={16} />
              </button>
            </div>
            <div
              className="settings-tabs"
              role="tablist"
              aria-label={m.settings}
            >
              <button
                id={`${idPrefix}-motion-tab`}
                role="tab"
                disabled={!scene || exporting}
                aria-controls={`${idPrefix}-motion-controls`}
                aria-selected={tab === "motion"}
                onClick={() => setTab("motion")}
              >
                <Icon name="orbit" size={16} />
                {m.motion}
              </button>
              <button
                id={`${idPrefix}-output-tab`}
                role="tab"
                disabled={!scene || exporting}
                aria-controls={`${idPrefix}-output-controls`}
                aria-selected={tab === "output"}
                onClick={() => setTab("output")}
              >
                <Icon name="download" size={16} />
                {m.output}
              </button>
            </div>
            <fieldset disabled={!scene || exporting} className="settings-fields">
              {tab === "motion" ? (
                <div
                  id={`${idPrefix}-motion-controls`}
                  role="tabpanel"
                  aria-labelledby={`${idPrefix}-motion-tab`}
                >
                  <Slider
                    label={m.zoom}
                    value={motion.zoom}
                    min={0}
                    max={1.5}
                    step={0.01}
                    display={`+${percent(motion.zoom)}`}
                    help={m.zoomHelp}
                    onChange={(n) => setParam("zoom", n)}
                  />
                  <Slider
                    label={m.initialZoom}
                    value={motion.initialZoom}
                    min={1}
                    max={2}
                    step={0.01}
                    display={percent(motion.initialZoom)}
                    onChange={(n) => setParam("initialZoom", n)}
                  />
                  <div className="control-divider" />
                  <div className="star-layer-controls">
                    <label className="select-control">
                      <span>{m.layerCount}</span>
                      <select
                        value={motion.layerCount}
                        onChange={(e) =>
                          setParam("layerCount", Number(e.target.value))
                        }
                      >
                        {[4, 6, 8, 12, 16, 24].map((count) => (
                          <option key={count} value={count}>
                            {count}
                          </option>
                        ))}
                      </select>
                      <small>{m.layerCountHelp}</small>
                    </label>
                    <Slider
                      label={m.depth}
                      value={motion.depth}
                      min={0}
                      max={3}
                      step={0.05}
                      display={`${number(motion.depth)}×`}
                      help={m.depthHelp}
                      onChange={(n) => setParam("depth", n)}
                    />
                    <Slider
                      label={m.starSpeed}
                      value={motion.starSpeed}
                      min={0}
                      max={3}
                      step={0.05}
                      display={`${number(motion.starSpeed)}×`}
                      help={m.starSpeedHelp}
                      onChange={(n) => setParam("starSpeed", n)}
                    />
                    <details className="layer-distribution">
                      <summary>{m.layerDistribution}</summary>
                      <div
                        className="layer-histogram"
                        style={{
                          gridTemplateColumns: `repeat(${layerDistribution.length}, minmax(0, 1fr))`,
                        }}
                      >
                        {layerDistribution.map((count, index) => (
                          <span
                            key={index}
                            className="layer-count-bar"
                            role="img"
                            aria-label={`${m.layer} ${index + 1}: ${count}`}
                            title={`${m.layer} ${index + 1}: ${count}`}
                          >
                            <i
                              aria-hidden="true"
                              style={{
                                height: `${(count / maxLayerPopulation) * 100}%`,
                              }}
                            />
                          </span>
                        ))}
                      </div>
                      <div className="layer-legend">
                        <span>{m.farPlane}</span>
                        <span>{m.nearPlane}</span>
                      </div>
                    </details>
                  </div>
                  <Slider
                    label={m.rotation}
                    value={motion.rotation}
                    min={0}
                    max={90}
                    display={`${motion.rotation}°`}
                    onChange={(n) => setParam("rotation", n)}
                  />
                  <div className="direction-control">
                    <button
                      aria-pressed={motion.direction === -1}
                      onClick={() => setParam("direction", -1)}
                    >
                      <Icon name="left" size={15} />
                      {m.left}
                    </button>
                    <button
                      aria-pressed={motion.direction === 1}
                      onClick={() => setParam("direction", 1)}
                    >
                      <Icon name="right" size={15} />
                      {m.right}
                    </button>
                  </div>
                  <div className="control-divider" />
                  <Slider
                    label={m.speed}
                    value={motion.speed}
                    min={0.25}
                    max={3}
                    step={0.05}
                    display={`${number(motion.speed)}×`}
                    help={m.speedHelp}
                    onChange={(n) => setParam("speed", n)}
                  />
                  <div className="focus-controls">
                    <span>
                      <Icon name="target" size={15} />
                      {m.focus}
                    </span>
                    <label>
                      X
                      <input
                        aria-label={`${m.focus} X`}
                        type="number"
                        min="0"
                        max="100"
                        value={Math.round(motion.focusX * 100)}
                        onChange={(e) =>
                          setParam(
                            "focusX",
                            Math.max(0, Math.min(100, Number(e.target.value))) /
                              100,
                          )
                        }
                      />
                      <span>%</span>
                    </label>
                    <label>
                      Y
                      <input
                        aria-label={`${m.focus} Y`}
                        type="number"
                        min="0"
                        max="100"
                        value={Math.round(motion.focusY * 100)}
                        onChange={(e) =>
                          setParam(
                            "focusY",
                            Math.max(0, Math.min(100, Number(e.target.value))) /
                              100,
                          )
                        }
                      />
                      <span>%</span>
                    </label>
                  </div>
                  <p className="depth-note">{m.depthNote}</p>
                </div>
              ) : (
                <div
                  id={`${idPrefix}-output-controls`}
                  role="tabpanel"
                  aria-labelledby={`${idPrefix}-output-tab`}
                >
                  <Slider
                    label={m.duration}
                    value={output.duration}
                    min={1}
                    max={60}
                    display={`${output.duration} s`}
                    onChange={(n) => setOut("duration", n)}
                  />
                  <label className="select-control">
                    <span>{m.fps}</span>
                    <select
                      value={output.fps}
                      onChange={(e) => setOut("fps", Number(e.target.value))}
                    >
                      {[24, 25, 30, 60, 90].map((fps) => (
                        <option key={fps} value={fps}>
                          {fps} FPS
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="select-control">
                    <span>{m.resolution}</span>
                    <select
                      value={output.height}
                      onChange={(e) => setOut("height", Number(e.target.value))}
                    >
                      {[720, 1080, 1440, 2160].map((height) => (
                        <option key={height} value={height}>
                          {height}p
                          {scene
                            ? ` · ${getOutputDimensions(scene.starless.originalWidth, scene.starless.originalHeight, height).width} × ${height}`
                            : ""}
                        </option>
                      ))}
                    </select>
                    <small>{m.aspect}</small>
                  </label>
                  <label className="select-control">
                    <span>{m.quality}</span>
                    <select
                      value={output.bitrate}
                      onChange={(e) =>
                        setOut("bitrate", Number(e.target.value))
                      }
                    >
                      <option value={8000000}>{m.standard} · 8 Mbps</option>
                      <option value={16000000}>{m.high} · 16 Mbps</option>
                      <option value={32000000}>{m.maximum} · 32 Mbps</option>
                    </select>
                  </label>
                </div>
              )}
            </fieldset>
            <div className="export-area">
              <div className="export-summary">
                <span>
                  {dimensions
                    ? `${dimensions.width} × ${dimensions.height}`
                    : `${output.height}p`}
                </span>
                <span>{output.fps} FPS</span>
                <span>{output.duration} s</span>
              </div>
              {exporting ? (
                <div className="export-progress" role="status">
                  <div>
                    <span>{m.exporting}</span>
                    <strong>{Math.round(exportProgress * 100)}%</strong>
                  </div>
                  <progress max="1" value={exportProgress} />
                  <button
                    className="quiet-button cancel-button"
                    onClick={() => exportController.current?.abort()}
                  >
                    <Icon name="close" size={15} />
                    {m.cancel}
                  </button>
                </div>
              ) : (
                <>
                  <button
                    className="export-button"
                    onClick={startExport}
                    disabled={!canExport}
                  >
                    <Icon name="download" size={19} />
                    {m.export}
                    <Icon name="play" size={13} />
                  </button>
                  <p className="export-hint">
                    {scene ? m.codecHint : m.exportHint}
                  </p>
                </>
              )}
              {downloadUrl && (
                <div className="export-ready" role="status">
                  <span>
                    <Icon name="check" size={16} />
                    {m.complete}
                  </span>
                  <a
                    className="download-link"
                    href={downloadUrl}
                    download={`cosmic-journey-${dimensions?.width}x${dimensions?.height}-${output.duration}s-${output.fps}fps.mp4`}
                  >
                    <Icon name="download" size={16} />
                    {m.download}
                  </a>
                </div>
              )}
              {cancelled && (
                <p className="notice" role="status">
                  {m.cancelled}
                </p>
              )}
              {exportError && (
                <p className="notice error" role="alert">
                  {errorText(exportError, language)}
                </p>
              )}
            </div>
          </aside>
        </div>
    </div>
  );
}

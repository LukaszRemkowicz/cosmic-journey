import { useEffect, useRef, useState } from "react";
import { copy } from "./i18n";
import { Icon } from "./Icon";
import Studio from "./Studio";

export default function App() {
  const [language, setLanguage] = useState<"pl" | "en">("en");
  const [demoOpen, setDemoOpen] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const demoTrigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const m = copy[language];

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (demoOpen) video.current?.focus({ preventScroll: true });
  }, [demoOpen]);

  function openDemo() {
    if (exporting || !dialog.current || dialog.current.open) return;
    setVideoError(false);
    dialog.current.showModal();
    setDemoOpen(true);
  }

  function closeDemo() {
    dialog.current?.close();
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          className="brand"
          href="/"
          aria-label={`Cosmic Journey By Luke v${__APP_VERSION__}`}
        >
          <span className="brand-mark">
            <Icon name="orbit" size={32} />
          </span>
          <span className="brand-copy">
            <span className="brand-title">
              <strong>Cosmic Journey By Luke</strong>
              <span className="brand-version">v{__APP_VERSION__}</span>
            </span>
            <small>{m.tagline}</small>
          </span>
        </a>
        <button
          ref={demoTrigger}
          type="button"
          className="demo-trigger"
          onClick={openDemo}
          disabled={exporting}
        >
          <Icon name="play" size={15} />
          {m.watchDemo}
        </button>
        <div className="header-actions">
          <span className="privacy">
            <Icon name="shield" size={15} />
            {m.local}
          </span>
          <div className="language-switch" aria-label={m.language}>
            <button
              lang="pl"
              aria-pressed={language === "pl"}
              onClick={() => setLanguage("pl")}
            >
              PL
            </button>
            <button
              lang="en"
              aria-pressed={language === "en"}
              onClick={() => setLanguage("en")}
            >
              EN
            </button>
          </div>
        </div>
      </header>
      <main>
        <Studio
          active={!demoOpen}
          language={language}
          onExportingChange={setExporting}
        />
      </main>
      <dialog
        ref={dialog}
        className="demo-dialog"
        aria-labelledby="demo-dialog-title"
        onClose={() => {
          setDemoOpen(false);
          setVideoError(false);
          demoTrigger.current?.focus({ preventScroll: true });
        }}
      >
        <div className="demo-dialog-heading">
          <h2 id="demo-dialog-title">{m.demoTitle}</h2>
          <button
            type="button"
            className="icon-button demo-close"
            aria-label={m.closeDemo}
            onClick={closeDemo}
          >
            <Icon name="close" size={19} />
          </button>
        </div>
        <div className="demo-video-frame">
          {demoOpen &&
            (videoError ? (
              <p className="demo-video-error" role="alert">
                {m.demoVideoError}
              </p>
            ) : (
              <video
                ref={video}
                className="demo-video"
                src="/demo/starfield.mp4"
                controls
                playsInline
                autoPlay
                muted
                preload="metadata"
                tabIndex={0}
                onError={() => setVideoError(true)}
              />
            ))}
        </div>
      </dialog>
      <footer>
        <span>Cosmic Journey By Luke</span>
        <span>
          <Icon name="shield" size={13} />
          {m.local}
        </span>
        <span>React · WebGL · MP4</span>
      </footer>
    </div>
  );
}

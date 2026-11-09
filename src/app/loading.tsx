export default function Loading() {
  return (
    <main className="site-shell" aria-busy="true" aria-label="Cargando contenido">
      <div className="site-header">
        <span className="wordmark">NETTI<span>.</span></span>
      </div>
      <div className="loading-stack">
        <div className="loading-line loading-short" />
        <div className="loading-line loading-title" />
        <div className="loading-line loading-copy" />
        <div className="loading-grid">
          <div className="loading-card" />
          <div className="loading-card" />
          <div className="loading-card" />
        </div>
      </div>
    </main>
  );
}

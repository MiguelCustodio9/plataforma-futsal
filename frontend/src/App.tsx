const modules = [
  "Plantel",
  "Staff",
  "Competições",
  "Jogos",
  "Análise",
  "Treinos",
  "Biblioteca de vídeos",
  "Perfil da jogadora",
];

export default function App() {
  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Navegação principal">
        <a className="brand" href="#inicio" aria-label="Plataforma Futsal, início">
          <span className="brand-mark">PF</span>
          <span>
            <strong>PLATAFORMA</strong>
            <small>FUTSAL</small>
          </span>
        </a>

        <div className="sidebar-label">ESPAÇO DESPORTIVO</div>
        <nav>
          <a className="nav-link active" href="#inicio" aria-current="page">
            <span aria-hidden="true">◈</span> Painel inicial
          </a>
          {modules.map((module) => (
            <a className="nav-link disabled-link" href="#modulos" key={module} aria-disabled="true">
              <span aria-hidden="true">◇</span> {module}
              <span className="soon">A preparar</span>
            </a>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="status-dot" />
          Fundação do projeto
          <small>Versão 0.1.0</small>
        </div>
      </aside>

      <section className="main-area" id="inicio">
        <header className="topbar">
          <div>
            <span className="eyebrow">PLATAFORMA PRIVADA</span>
            <h1>Centro de controlo</h1>
          </div>
          <div className="topbar-meta">
            <span className="environment">AMBIENTE DE DESENVOLVIMENTO</span>
            <span className="avatar" aria-label="Sem sessão iniciada">—</span>
          </div>
        </header>

        <div className="content">
          <section className="welcome-panel">
            <div className="welcome-copy">
              <span className="eyebrow">BEM-VINDO À FUNDAÇÃO</span>
              <h2>O próximo nível da gestão de futsal começa aqui.</h2>
              <p>
                A estrutura técnica está a ser preparada. Os módulos serão ativados
                progressivamente, depois de implementados e testados.
              </p>
            </div>
            <div className="court-art" aria-hidden="true">
              <div className="court-line center-line" />
              <div className="court-circle" />
              <div className="court-box court-box-left" />
              <div className="court-box court-box-right" />
            </div>
          </section>

          <div className="section-heading">
            <div>
              <span className="eyebrow">CONSTRUÇÃO DA PLATAFORMA</span>
              <h2>Áreas do projeto</h2>
            </div>
            <span className="phase-tag">FASE 01 · FUNDAÇÃO</span>
          </div>

          <section className="module-grid" id="modulos" aria-label="Áreas previstas">
            {modules.map((module, index) => (
              <article className="module-card" key={module}>
                <span className="module-number">{String(index + 1).padStart(2, "0")}</span>
                <h3>{module}</h3>
                <p>Área prevista no plano funcional do projeto.</p>
                <span className="module-state">Planeado</span>
              </article>
            ))}
          </section>

          <footer className="page-footer">
            <span>Plataforma Futsal</span>
            <span>Privacidade e segurança desde a primeira linha de código.</span>
          </footer>
        </div>
      </section>
    </main>
  );
}

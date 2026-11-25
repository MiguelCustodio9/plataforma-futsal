import { useMemo, useState, type FormEvent } from "react";

const modules = [
  "Plantel", "Staff", "Competições", "Jogos", "Análise", "Treinos",
  "Biblioteca de vídeos", "Perfil da jogadora",
];

const staffRoles = [
  "Treinador Principal", "Estagiário", "Adjunto", "Treinador de GR",
  "Delegado", "Presidente", "Diretor", "Fisioterapeuta", "Massagista", "Enfermeira",
];

type StaffStatus = "Ativo" | "Convite pendente" | "Suspenso" | "Arquivado";
type StaffMember = {
  id: number;
  name: string;
  fullName: string;
  email: string;
  birthDate: string;
  roles: string[];
  status: StaffStatus;
  createdAt: string;
};

const initialStaff: StaffMember[] = [
  { id: 1, name: "Exemplo de treinador", fullName: "Exemplo de treinador", email: "treinador@exemplo.pt", birthDate: "", roles: ["Treinador Principal"], status: "Ativo", createdAt: "2026-11-25" },
  { id: 2, name: "Exemplo de adjunto", fullName: "Exemplo de adjunto", email: "adjunto@exemplo.pt", birthDate: "", roles: ["Adjunto", "Treinador de GR"], status: "Convite pendente", createdAt: "2026-11-25" },
];

export default function App() {
  const [activeArea, setActiveArea] = useState("Painel inicial");
  const [staff, setStaff] = useState<StaffMember[]>(initialStaff);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [roleFilter, setRoleFilter] = useState("Todas");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ name: "", fullName: "", email: "", birthDate: "", roles: ["Adjunto"] as string[] });

  const filteredStaff = useMemo(() => staff.filter((member) => {
    const matchesQuery = [member.name, member.fullName, member.email, ...member.roles]
      .join(" ").toLocaleLowerCase("pt-PT").includes(query.toLocaleLowerCase("pt-PT"));
    const matchesStatus = statusFilter === "Todos" || member.status === statusFilter;
    const matchesRole = roleFilter === "Todas" || member.roles.includes(roleFilter);
    return matchesQuery && matchesStatus && matchesRole;
  }), [staff, query, statusFilter, roleFilter]);

  const openNewForm = () => {
    setEditingId(null);
    setForm({ name: "", fullName: "", email: "", birthDate: "", roles: ["Adjunto"] });
    setFormError("");
    setShowForm(true);
  };

  const openEditForm = (member: StaffMember) => {
    setEditingId(member.id);
    setForm({ name: member.name, fullName: member.fullName, email: member.email, birthDate: member.birthDate, roles: [...member.roles] });
    setFormError("");
    setShowForm(true);
  };

  const saveStaff = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = form.email.trim().toLocaleLowerCase("pt-PT");
    if (!form.name.trim() || !email || form.roles.length === 0) {
      setFormError("Preenche o nome, o email e pelo menos uma função.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError("Indica um endereço de email válido.");
      return;
    }
    if (staff.some((member) => member.email.toLocaleLowerCase("pt-PT") === email && member.id !== editingId)) {
      setFormError("Já existe um registo de Staff com este email.");
      return;
    }
    if (editingId !== null) {
      setStaff((current) => current.map((member) => member.id === editingId
        ? { ...member, name: form.name.trim(), fullName: form.fullName.trim() || form.name.trim(), email, birthDate: form.birthDate, roles: form.roles }
        : member));
    } else {
      setStaff((current) => [...current, {
        id: Math.max(0, ...current.map((member) => member.id)) + 1,
        name: form.name.trim(),
        fullName: form.fullName.trim() || form.name.trim(),
        email,
        birthDate: form.birthDate,
        roles: form.roles,
        status: "Convite pendente",
        createdAt: new Date().toISOString().slice(0, 10),
      }]);
    }
    setShowForm(false);
  };

  const changeStatus = (id: number, status: StaffStatus) => {
    setStaff((current) => current.map((member) => member.id === id ? { ...member, status } : member));
  };

  const toggleRole = (role: string) => {
    setForm((current) => ({
      ...current,
      roles: current.roles.includes(role) ? current.roles.filter((item) => item !== role) : [...current.roles, role],
    }));
  };

  const statusCount = (status: StaffStatus) => staff.filter((member) => member.status === status).length;

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Navegação principal">
        <a className="brand" href="#inicio" aria-label="Plataforma Futsal, início" onClick={() => setActiveArea("Painel inicial")}>
          <span className="brand-mark">PF</span>
          <span><strong>PLATAFORMA</strong><small>FUTSAL</small></span>
        </a>
        <div className="sidebar-label">ESPAÇO DESPORTIVO</div>
        <nav>
          <button className={activeArea === "Painel inicial" ? "nav-link active" : "nav-link"} onClick={() => setActiveArea("Painel inicial")}>
            <span aria-hidden="true">◈</span> Painel inicial
          </button>
          {modules.map((module) => (
            <button key={module} className={activeArea === module ? "nav-link active" : "nav-link"} onClick={() => setActiveArea(module)} aria-current={activeArea === module ? "page" : undefined}>
              <span aria-hidden="true">◇</span> {module}
              {module !== "Staff" && <span className="soon">A preparar</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer"><span className="status-dot" /> Fundação do projeto<small>Versão 0.2.0 · Módulo Staff</small></div>
      </aside>

      <section className="main-area" id="inicio">
        <header className="topbar">
          <div><span className="eyebrow">PLATAFORMA PRIVADA</span><h1>{activeArea === "Staff" ? "Gestão de Staff" : "Centro de controlo"}</h1></div>
          <div className="topbar-meta"><span className="environment">AMBIENTE DE DESENVOLVIMENTO</span><span className="avatar" aria-label="Sem sessão iniciada">—</span></div>
        </header>

        {activeArea === "Staff" ? (
          <div className="content staff-content">
            <div className="staff-heading">
              <div><span className="eyebrow">MÓDULO 01 · EQUIPA TÉCNICA</span><h2>Staff</h2><p>Gere os elementos da equipa técnica, as suas funções e o estado dos acessos.</p></div>
              <button className="primary-button" onClick={openNewForm}>＋ Adicionar elemento</button>
            </div>

            <section className="staff-stats" aria-label="Resumo do Staff">
              <article><span>Total de registos</span><strong>{staff.length}</strong></article>
              <article><span>Ativos</span><strong>{statusCount("Ativo")}</strong></article>
              <article><span>Convites pendentes</span><strong>{statusCount("Convite pendente")}</strong></article>
              <article><span>Suspensos</span><strong>{statusCount("Suspenso")}</strong></article>
            </section>

            <section className="staff-toolbar" aria-label="Pesquisa e filtros">
              <label className="search-field"><span>Pesquisar</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, email ou função..." /></label>
              <label><span>Estado</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>Todos</option><option>Ativo</option><option>Convite pendente</option><option>Suspenso</option><option>Arquivado</option></select></label>
              <label><span>Função</span><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="Todas">Todas</option>{staffRoles.map((role) => <option key={role}>{role}</option>)}</select></label>
            </section>

            <section className="staff-table-wrap" aria-label="Lista de Staff">
              <div className="table-title"><div><h3>Elementos registados</h3><span>{filteredStaff.length} resultado(s)</span></div></div>
              {filteredStaff.length === 0 ? <div className="empty-state"><strong>Não foram encontrados elementos.</strong><span>Altera os filtros ou adiciona um novo elemento ao Staff.</span></div> : (
                <div className="staff-list">
                  {filteredStaff.map((member) => (
                    <article className="staff-row" key={member.id}>
                      <div className="staff-person"><span className="staff-avatar">{member.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toLocaleUpperCase("pt-PT")}</span><div><strong>{member.name}</strong><span>{member.email}</span></div></div>
                      <div className="staff-roles">{member.roles.map((role) => <span key={role}>{role}</span>)}</div>
                      <div><span className={`status-pill status-${member.status.toLocaleLowerCase("pt-PT").replaceAll(" ", "-")}`}>{member.status}</span></div>
                      <div className="staff-actions"><button onClick={() => openEditForm(member)}>Editar</button>{member.status === "Ativo" ? <button onClick={() => changeStatus(member.id, "Suspenso")}>Suspender</button> : member.status === "Suspenso" ? <button onClick={() => changeStatus(member.id, "Ativo")}>Reativar</button> : member.status === "Convite pendente" ? <button onClick={() => changeStatus(member.id, "Ativo")}>Ativar (demonstração)</button> : <button onClick={() => changeStatus(member.id, "Ativo")}>Reativar</button>}</div>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <p className="demo-notice">Modo de demonstração: os registos ficam apenas no estado desta sessão. Convites por email, autenticação e persistência serão ligados ao backend numa etapa posterior.</p>
          </div>
        ) : (
          <div className="content">
            <section className="welcome-panel"><div className="welcome-copy"><span className="eyebrow">BEM-VINDO À FUNDAÇÃO</span><h2>O próximo nível da gestão de futsal começa aqui.</h2><p>A estrutura técnica está a ser preparada. Os módulos serão ativados progressivamente, depois de implementados e testados.</p></div><div className="court-art" aria-hidden="true"><div className="court-line center-line" /><div className="court-circle" /><div className="court-box court-box-left" /><div className="court-box court-box-right" /></div></section>
            <div className="section-heading"><div><span className="eyebrow">CONSTRUÇÃO DA PLATAFORMA</span><h2>Áreas do projeto</h2></div><span className="phase-tag">FASE 01 · FUNDAÇÃO</span></div>
            <section className="module-grid" id="modulos" aria-label="Áreas previstas">{modules.map((module, index) => <article className="module-card" key={module}><span className="module-number">{String(index + 1).padStart(2, "0")}</span><h3>{module}</h3><p>Área prevista no plano funcional do projeto.</p><span className="module-state">{module === "Staff" ? "Em implementação" : "Planeado"}</span></article>)}</section>
            <footer className="page-footer"><span>Plataforma Futsal</span><span>Privacidade e segurança desde a primeira linha de código.</span></footer>
          </div>
        )}
      </section>

      {showForm && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForm(false); }}>
        <section className="staff-modal" role="dialog" aria-modal="true" aria-labelledby="staff-form-title">
          <div className="modal-heading"><div><span className="eyebrow">GESTÃO DE EQUIPA</span><h2 id="staff-form-title">{editingId === null ? "Adicionar elemento" : "Editar elemento"}</h2></div><button className="icon-button" onClick={() => setShowForm(false)} aria-label="Fechar">×</button></div>
          <form onSubmit={saveStaff}>
            <div className="form-grid">
              <label><span>Nome apresentado *</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
              <label><span>Nome completo</span><input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label>
              <label><span>Email de convite *</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
              <label><span>Data de nascimento</span><input type="date" value={form.birthDate} onChange={(event) => setForm({ ...form, birthDate: event.target.value })} /></label>
            </div>
            <fieldset className="role-picker"><legend>Funções permanentes *</legend><div>{staffRoles.map((role) => <label key={role}><input type="checkbox" checked={form.roles.includes(role)} onChange={() => toggleRole(role)} />{role}</label>)}</div></fieldset>
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancelar</button><button type="submit" className="primary-button">Guardar elemento</button></div>
          </form>
        </section>
      </div>}
    </main>
  );
}

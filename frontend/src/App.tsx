import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase, testSupabaseConnection } from "./lib/supabase";

const modules = [
  "Plantel", "Staff", "Competições", "Jogos", "Análise", "Treinos",
  "Biblioteca de vídeos", "Perfil da jogadora",
];

const staffRoles = [
  "Treinador Principal", "Treinador Estagiário", "Treinador Adjunto", "Treinador de GR",
  "Delegado", "Presidente", "Diretor", "Fisioterapeuta", "Massagista", "Enfermeira", "Estagiário",
];

type StaffStatus = "Ativo" | "Convite pendente" | "Convite expirado" | "Suspenso" | "Arquivado";
type StaffMember = {
  id: string;
  profileId: string | null;
  name: string;
  fullName: string;
  email: string;
  birthDate: string;
  roles: string[];
  status: StaffStatus;
  createdAt: string;
  accountDeletedAt: string | null;
};

type StaffDbRow = {
  id: string;
  profile_id: string | null;
  name: string;
  full_name: string;
  email: string;
  birth_date: string | null;
  status: "pendente" | "convite_enviado" | "ativo" | "suspenso" | "convite_expirado" | "arquivado";
  created_at: string;
  account_deleted_at?: string | null;
  staff_member_roles: { role_name: string }[] | null;
};

const statusFromDatabase: Record<StaffDbRow["status"], StaffStatus> = {
  pendente: "Convite pendente",
  convite_enviado: "Convite pendente",
  ativo: "Ativo",
  suspenso: "Suspenso",
  convite_expirado: "Convite expirado",
  arquivado: "Arquivado",
};

const statusToDatabase: Record<StaffStatus, StaffDbRow["status"]> = {
  "Ativo": "ativo",
  "Convite pendente": "pendente",
  "Convite expirado": "convite_expirado",
  "Suspenso": "suspenso",
  "Arquivado": "arquivado",
};

function mapStaffRow(row: StaffDbRow): StaffMember {
  return {
    id: row.id,
    profileId: row.profile_id,
    name: row.name,
    fullName: row.full_name,
    email: row.email,
    birthDate: row.birth_date ?? "",
    roles: (row.staff_member_roles ?? []).map((role) => role.role_name),
    status: statusFromDatabase[row.status],
    createdAt: row.created_at.slice(0, 10),
    accountDeletedAt: row.account_deleted_at ?? null,
  };
}

type AppRole = "administrador_principal" | "treinador_principal" | "staff" | "jogadora";
type UserProfile = { displayName: string; role: AppRole; status: string };

const roleLabels: Record<AppRole, string> = {
  administrador_principal: "Administrador Principal",
  treinador_principal: "Treinador Principal",
  staff: "Staff",
  jogadora: "Jogadora",
};

function Dashboard({ profile }: { profile: UserProfile }) {
  const canManageStaff = profile.role === "administrador_principal" || profile.role === "treinador_principal";
  useEffect(() => {
    void testSupabaseConnection();
  }, []);


  const [activeArea, setActiveArea] = useState("Painel inicial");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffError, setStaffError] = useState("");
  const [savingStaff, setSavingStaff] = useState(false);
  const [invitingStaffId, setInvitingStaffId] = useState<string | null>(null);
  const [accountActionMember, setAccountActionMember] = useState<StaffMember | null>(null);
  const [accountAction, setAccountAction] = useState<"resend_invite" | "delete_account" | null>(null);
  const [accountActionBusy, setAccountActionBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [roleFilter, setRoleFilter] = useState("Todas");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ name: "", fullName: "", email: "", birthDate: "", roles: [] as string[] });

  const loadStaff = useCallback(async () => {
    setStaffLoading(true);
    setStaffError("");
    try {
      let { data, error } = await supabase
        .from("staff_members")
        .select("id, profile_id, name, full_name, email, birth_date, status, created_at, account_deleted_at, staff_member_roles(role_name)")
        .order("created_at", { ascending: false });
      // Mantém o módulo utilizável enquanto a migration de auditoria ainda não foi aplicada.
      if (error && error.message.includes("account_deleted_at")) {
        const legacyResult = await supabase
          .from("staff_members")
          .select("id, profile_id, name, full_name, email, birth_date, status, created_at, staff_member_roles(role_name)")
          .order("created_at", { ascending: false });
        data = legacyResult.data as unknown as typeof data;
        error = legacyResult.error;
      }
      if (error) throw error;
      setStaff(((data ?? []) as StaffDbRow[]).map((row) => mapStaffRow({
        ...row,
        account_deleted_at: row.account_deleted_at ?? null,
      })));
    } catch (error) {
      console.error("Erro ao carregar Staff:", error);
      setStaffError("Não foi possível carregar os elementos do Staff. Verifica a ligação e as permissões e tenta novamente.");
    } finally {
      setStaffLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  const filteredStaff = useMemo(() => staff.filter((member) => {
    const matchesQuery = [member.name, member.fullName, member.email, ...member.roles]
      .join(" ").toLocaleLowerCase("pt-PT").includes(query.toLocaleLowerCase("pt-PT"));
    const matchesStatus = statusFilter === "Todos" || member.status === statusFilter;
    const matchesRole = roleFilter === "Todas" || member.roles.includes(roleFilter);
    return matchesQuery && matchesStatus && matchesRole;
  }), [staff, query, statusFilter, roleFilter]);

  const openNewForm = () => {
    setEditingId(null);
    setForm({ name: "", fullName: "", email: "", birthDate: "", roles: [] });
    setFormError("");
    setShowForm(true);
  };

  const openEditForm = (member: StaffMember) => {
    setEditingId(member.id);
    setForm({ name: member.name, fullName: member.fullName, email: member.email, birthDate: member.birthDate, roles: [...member.roles] });
    setFormError("");
    setShowForm(true);
  };

  const saveStaff = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = form.email.trim().toLocaleLowerCase("pt-PT");
    const name = form.name.trim();
    const fullName = form.fullName.trim() || name;
    if (!name || !email || form.roles.length === 0) {
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

    setSavingStaff(true);
    setFormError("");
    try {
      if (editingId) {
        const existing = staff.find((member) => member.id === editingId);
        const { error: updateError } = await supabase.from("staff_members").update({
          name, full_name: fullName, email, birth_date: form.birthDate || null,
        }).eq("id", editingId);
        if (updateError) throw updateError;

        const removedRoles = (existing?.roles ?? []).filter((role) => !form.roles.includes(role));
        const addedRoles = form.roles.filter((role) => !(existing?.roles ?? []).includes(role));
        if (removedRoles.length) {
          const { error } = await supabase.from("staff_member_roles").delete()
            .eq("staff_member_id", editingId).in("role_name", removedRoles);
          if (error) throw error;
        }
        if (addedRoles.length) {
          const { error } = await supabase.from("staff_member_roles").insert(
            addedRoles.map((role_name) => ({ staff_member_id: editingId, role_name })),
          );
          if (error) throw error;
        }
      } else {
        const { data, error: insertError } = await supabase.from("staff_members").insert({
          name, full_name: fullName, email, birth_date: form.birthDate || null, status: "pendente",
        }).select("id").single();
        if (insertError || !data) throw insertError ?? new Error("Não foi possível obter o registo criado.");
        const { error: rolesError } = await supabase.from("staff_member_roles").insert(
          form.roles.map((role_name) => ({ staff_member_id: data.id, role_name })),
        );
        if (rolesError) throw rolesError;
      }
      await loadStaff();
      setShowForm(false);
    } catch (error) {
      console.error("Erro ao guardar elemento de Staff:", error);
      setFormError("Não foi possível guardar as alterações. Confirma se o email já existe e se tens permissões para gerir o Staff.");
    } finally {
      setSavingStaff(false);
    }
  };

  const sendStaffInvite = async (member: StaffMember) => {
    setInvitingStaffId(member.id);
    setStaffError("");
    try {
      const { error } = await supabase.functions.invoke("invite-staff", {
        body: { staffMemberId: member.id },
      });
      if (error) throw error;
      await loadStaff();
    } catch (error) {
      console.error("Erro ao enviar convite de Staff:", error);
      let message = "Não foi possível enviar o convite. Tenta novamente.";
      if (error && typeof error === "object" && "context" in error) {
        const context = (error as { context?: unknown }).context;
        if (context instanceof Response) {
          try {
            const payload = await context.clone().json() as { error?: unknown; diagnostic?: unknown };
            if (typeof payload.error === "string" && payload.error.trim()) {
              message = payload.error;
            }
            if (typeof payload.diagnostic === "string" && payload.diagnostic.trim()) {
              message = `${message} (diagnóstico: ${payload.diagnostic})`;
            }
          } catch {
            // Mantém a mensagem genérica se a resposta não tiver JSON válido.
          }
        }
      }
      setStaffError(message);
    } finally {
      setInvitingStaffId(null);
    }
  };

  const manageStaffAccount = async () => {
    if (!accountActionMember || !accountAction) return;
    setAccountActionBusy(true);
    setStaffError("");
    try {
      const { error } = await supabase.functions.invoke("manage-staff-account", {
        body: { action: accountAction, staffMemberId: accountActionMember.id },
      });
      if (error) throw error;
      setAccountActionMember(null);
      setAccountAction(null);
      await loadStaff();
    } catch (error) {
      console.error("Erro ao gerir conta Staff:", error);
      let message = "Não foi possível concluir a operação. Tenta novamente.";
      if (error && typeof error === "object" && "context" in error) {
        const context = (error as { context?: unknown }).context;
        if (context instanceof Response) {
          try {
            const payload = await context.clone().json() as { error?: unknown };
            if (typeof payload.error === "string" && payload.error.trim()) message = payload.error;
          } catch { /* Mantém a mensagem genérica. */ }
        }
      }
      setStaffError(message);
    } finally {
      setAccountActionBusy(false);
    }
  };

  const changeStatus = async (id: string, status: StaffStatus) => {
    setStaffError("");
    const { error } = await supabase.from("staff_members")
      .update({ status: statusToDatabase[status] }).eq("id", id);
    if (error) {
      console.error("Erro ao alterar estado do Staff:", error);
      setStaffError("Não foi possível alterar o estado deste elemento.");
      return;
    }
    await loadStaff();
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
          <div className="topbar-meta"><div className="account-identity"><strong>{profile.displayName}</strong><span>{roleLabels[profile.role]}</span></div><span className="environment">SESSÃO AUTENTICADA</span><button className="sign-out-button" onClick={() => void supabase.auth.signOut()}>Terminar sessão</button></div>
        </header>

        {activeArea === "Staff" ? (
          <div className="content staff-content">
            <div className="staff-heading">
              <div><span className="eyebrow">MÓDULO 01 · EQUIPA TÉCNICA</span><h2>Staff</h2><p>Gere os elementos da equipa técnica, as suas funções e o estado dos acessos.</p></div>
              {canManageStaff && <button className="primary-button" onClick={openNewForm}>＋ Adicionar elemento</button>}
            </div>

            <section className="staff-stats" aria-label="Resumo do Staff">
              <article><span>Total de registos</span><strong>{staff.length}</strong></article>
              <article><span>Ativos</span><strong>{statusCount("Ativo")}</strong></article>
              <article><span>Convites pendentes</span><strong>{statusCount("Convite pendente")}</strong></article>
              <article><span>Suspensos</span><strong>{statusCount("Suspenso")}</strong></article>
            </section>

            <section className="staff-toolbar" aria-label="Pesquisa e filtros">
              <label className="search-field"><span>Pesquisar</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, email ou função..." /></label>
              <label><span>Estado</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>Todos</option><option>Ativo</option><option>Convite pendente</option><option>Convite expirado</option><option>Suspenso</option><option>Arquivado</option></select></label>
              <label><span>Função</span><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="Todas">Todas</option>{staffRoles.map((role) => <option key={role}>{role}</option>)}</select></label>
            </section>

            <section className="staff-table-wrap" aria-label="Lista de Staff">
              <div className="table-title"><div><h3>Elementos registados</h3><span>{filteredStaff.length} resultado(s)</span></div></div>
              {staffLoading ? <div className="empty-state"><strong>A carregar elementos do Staff…</strong></div> : staffError ? <div className="empty-state"><strong>{staffError}</strong><button className="secondary-button" onClick={() => void loadStaff()}>Tentar novamente</button></div> : filteredStaff.length === 0 ? <div className="empty-state"><strong>Não foram encontrados elementos.</strong><span>Altera os filtros ou adiciona um novo elemento ao Staff.</span></div> : (
                <div className="staff-list">
                  {filteredStaff.map((member) => (
                    <article className="staff-row" key={member.id}>
                      <div className="staff-person"><span className="staff-avatar">{member.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toLocaleUpperCase("pt-PT")}</span><div><strong>{member.name}</strong><span>{member.email}</span></div></div>
                      <div className="staff-roles">{member.roles.map((role) => <span key={role}>{role}</span>)}</div>
                      <div><span className={`status-pill status-${member.status.toLocaleLowerCase("pt-PT").replaceAll(" ", "-")}`}>{member.status}</span></div>
                      {canManageStaff && <div className="staff-actions">
                        <button onClick={() => openEditForm(member)}>Editar</button>
                        {member.status === "Ativo" && member.profileId && <button onClick={() => void changeStatus(member.id, "Suspenso")}>Suspender</button>}
                        {member.status === "Suspenso" && <button onClick={() => void changeStatus(member.id, "Ativo")}>Reativar</button>}
                        {member.status === "Convite pendente" && !member.profileId && <button onClick={() => void sendStaffInvite(member)} disabled={invitingStaffId === member.id}>{invitingStaffId === member.id ? "A enviar…" : "Enviar convite"}</button>}
                        {member.status === "Convite pendente" && member.profileId && <button onClick={() => { setAccountActionMember(member); setAccountAction("resend_invite"); }}>Reenviar convite</button>}
                        {member.status === "Convite expirado" && <button onClick={() => { setAccountActionMember(member); setAccountAction("resend_invite"); }}>Reenviar convite</button>}
                        {member.status === "Ativo" && !member.profileId && member.accountDeletedAt && <button onClick={() => { setAccountActionMember(member); setAccountAction("resend_invite"); }}>Restaurar acesso</button>}
                        {member.status === "Ativo" && member.profileId && <button onClick={() => { setAccountActionMember(member); setAccountAction("delete_account"); }}>Eliminar conta</button>}
                        {member.status === "Suspenso" && member.profileId && <button onClick={() => { setAccountActionMember(member); setAccountAction("delete_account"); }}>Eliminar conta</button>}
                        {member.accountDeletedAt && <span className="invite-sent-label"><span className="invite-sent-copy"><strong>Conta eliminada</strong><small>{new Date(member.accountDeletedAt).toLocaleDateString("pt-PT")}</small></span></span>}
                      </div>}
                    </article>
                  ))}
                </div>
              )}
            </section>
            {canManageStaff ? <p className="demo-notice">Os convites são enviados por email aos elementos registados. A ativação da conta acontece depois de definirem a sua palavra-passe.</p> : <p className="demo-notice">Apenas o Administrador Principal e o Treinador Principal podem adicionar, editar, suspender ou reativar elementos do Staff.</p>}{staffError && !staffLoading && <p className="form-error" role="alert">{staffError}</p>}
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

      {accountActionMember && accountAction && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !accountActionBusy) { setAccountActionMember(null); setAccountAction(null); } }}>
        <section className="staff-modal" role="dialog" aria-modal="true" aria-labelledby="account-action-title">
          <div className="modal-heading"><div><span className="eyebrow">SEGURANÇA DA CONTA</span><h2 id="account-action-title">{accountAction === "delete_account" ? "Eliminar conta de acesso" : "Reenviar convite"}</h2></div><button className="icon-button" onClick={() => { setAccountActionMember(null); setAccountAction(null); }} aria-label="Fechar" disabled={accountActionBusy}>×</button></div>
          {accountAction === "delete_account" ? <p>Vais eliminar a conta de acesso de <strong>{accountActionMember.name}</strong> ({accountActionMember.email}). A ficha Staff, as funções e o histórico serão preservados. A pessoa deixará de conseguir iniciar sessão.</p> : <p>Será enviado um novo convite para <strong>{accountActionMember.email}</strong>. O convite anterior será invalidado. A ficha Staff e o histórico serão mantidos.</p>}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => { setAccountActionMember(null); setAccountAction(null); }} disabled={accountActionBusy}>Cancelar</button><button type="button" className="primary-button" onClick={() => void manageStaffAccount()} disabled={accountActionBusy}>{accountActionBusy ? "A processar…" : accountAction === "delete_account" ? "Confirmar eliminação" : "Confirmar reenvio"}</button></div>
        </section>
      </div>}
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
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancelar</button><button type="submit" className="primary-button" disabled={savingStaff}>{savingStaff ? "A guardar…" : "Guardar elemento"}</button></div>
          </form>
        </section>
      </div>}
    </main>
  );
}


function AuthGate() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileRefresh, setProfileRefresh] = useState(0);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordSetupRequired, setPasswordSetupRequired] = useState(() => {
    const authType = new URLSearchParams(window.location.hash.slice(1)).get("type");
    return authType === "invite" || authType === "recovery";
  });
  const [isStaffInviteFlow, setIsStaffInviteFlow] = useState(() =>
    new URLSearchParams(window.location.hash.slice(1)).get("type") === "invite"
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (mounted) {
        if (event === "PASSWORD_RECOVERY") setPasswordSetupRequired(true);
        setSession(nextSession);
        setCheckingSession(false);
      }
    });
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return;
      if (sessionError) setError("Não foi possível verificar a sessão. Tenta novamente.");
      setSession(data.session);
      setCheckingSession(false);
    }).catch(() => {
      if (mounted) {
        setError("Não foi possível contactar o serviço de autenticação.");
        setCheckingSession(false);
      }
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    if (!session?.user.id) {
      setProfile(null);
      setProfileLoading(false);
      setProfileError("");
      return;
    }

    setProfileLoading(true);
    setProfileError("");

    const loadProfile = async () => {
      try {
        const { data, error: queryError } = await supabase
          .from("profiles")
          .select("display_name, role, status")
          .eq("id", session.user.id)
          .single();

        if (!mounted) return;

        if (queryError || !data) {
          console.error("Não foi possível carregar o perfil:", queryError?.message);
          setProfile(null);
          setProfileError("Não foi possível carregar o perfil desta conta. Contacta o administrador.");
          return;
        }

        const allowedRoles: AppRole[] = [
          "administrador_principal",
          "treinador_principal",
          "staff",
          "jogadora",
        ];

        if (!allowedRoles.includes(data.role as AppRole)) {
          setProfile(null);
          setProfileError("A conta tem um papel inválido. Contacta o administrador.");
          return;
        }

        setProfile({
          displayName: data.display_name,
          role: data.role as AppRole,
          status: data.status,
        });
      } catch (profileQueryError: unknown) {
        console.error("Erro inesperado ao carregar o perfil:", profileQueryError);
        if (mounted) {
          setProfile(null);
          setProfileError("Ocorreu um erro ao carregar o perfil. Tenta novamente.");
        }
      } finally {
        if (mounted) setProfileLoading(false);
      }
    };

    void loadProfile();

    return () => {
      mounted = false;
    };
  }, [session?.user.id, profileRefresh]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (loginError) setError("Não foi possível iniciar sessão. Confirma o email e a palavra-passe.");
    } catch {
      setError("O serviço de autenticação não está disponível neste momento.");
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordReset = async () => {
    setError("");
    setMessage("");
    if (!email.trim()) {
      setError("Introduz o teu email para receberes a ligação de recuperação.");
      return;
    }
    setBusy(true);
    try {
      const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).toString();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (resetError) setError("Não foi possível enviar a ligação de recuperação. Confirma o email e tenta novamente.");
      else setMessage("Se existir uma conta associada a este email, receberás uma mensagem com os passos para repor a palavra-passe.");
    } catch {
      setError("Não foi possível contactar o serviço de autenticação.");
    } finally {
      setBusy(false);
    }
  };

  const handleSetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      setError("A palavra-passe deve ter pelo menos 12 caracteres, incluindo maiúscula, minúscula, número e símbolo.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As palavras-passe não coincidem.");
      return;
    }
    setBusy(true);
    try {
      const { data: updatedAuth, error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError || !updatedAuth.user) {
        setError("Não foi possível definir a palavra-passe. Pede uma nova ligação de convite ou recuperação.");
        return;
      }
      // O convite identifica este fluxo; a função valida o perfil com privilégios
      // de servidor, evitando uma consulta a profiles que pode ser bloqueada por RLS.
      if (isStaffInviteFlow) {
        const { error: activationError } = await supabase.functions.invoke("accept-staff-invite", { body: {} });
        if (activationError) {
          let activationMessage = "A ativação não foi concluída. A palavra-passe já ficou guardada.";
          if (activationError && typeof activationError === "object" && "context" in activationError) {
            const context = (activationError as { context?: unknown }).context;
            if (context instanceof Response) {
              try {
                const payload = await context.clone().json() as { error?: unknown; diagnostic?: unknown };
                if (typeof payload.error === "string" && payload.error.trim()) activationMessage = payload.error;
                if (typeof payload.diagnostic === "string" && payload.diagnostic.trim()) {
                  activationMessage = `${activationMessage} (diagnóstico: ${payload.diagnostic})`;
                }
              } catch {
                // Mantém a mensagem segura se a resposta não tiver JSON válido.
              }
            }
          }
          console.error("Falha ao ativar convite Staff:", activationError);
          setError(activationMessage);
          return;
        }
      }
      window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
      setPasswordSetupRequired(false);
      setIsStaffInviteFlow(false);
      setPassword("");
      setConfirmPassword("");
      if (isStaffInviteFlow) setProfileRefresh((current) => current + 1);
    } catch {
      setError("Não foi possível contactar o serviço de autenticação.");
    } finally {
      setBusy(false);
    }
  };

  if (checkingSession) {
    return <main className="auth-loading"><span className="auth-spinner" /><p>A verificar sessão segura…</p></main>;
  }

  if (session && passwordSetupRequired) {
    return (
      <main className="auth-page">
        <section className="auth-visual" aria-label="Plataforma privada de futsal">
          <a className="brand auth-brand" href="#password"><span className="brand-mark">PF</span><span><strong>PLATAFORMA</strong><small>FUTSAL</small></span></a>
          <div className="auth-visual-copy"><span className="eyebrow">ACESSO SEGURO</span><h1>O primeiro passo para entrar em campo.</h1><p>Define uma palavra-passe pessoal para protegeres o acesso à plataforma.</p></div>
          <div className="auth-court-art" aria-hidden="true"><span /><i /><b /></div>
          <span className="auth-visual-foot">ACESSO EXCLUSIVO A UTILIZADORES AUTORIZADOS</span>
        </section>
        <section className="auth-panel" id="password">
          <div className="auth-form-wrap">
            <span className="eyebrow">CONTA CONVIDADA</span>
            <h2>Definir palavra-passe</h2>
            <p className="auth-intro">Escolhe uma palavra-passe segura para ativares o teu acesso.</p>
            <form className="auth-form" onSubmit={handleSetPassword}>
              <label htmlFor="new-password">Nova palavra-passe</label>
              <div className="auth-password-field"><input id="new-password" type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo de 12 caracteres" required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}>{showPassword ? "Ocultar" : "Mostrar"}</button></div>
              <label htmlFor="confirm-password">Confirmar palavra-passe</label>
              <input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repete a palavra-passe" required />
              <p className="auth-password-hint">Pelo menos 12 caracteres, com maiúscula, minúscula, número e símbolo.</p>
              {error && <p className="auth-feedback auth-error" role="alert">{error}</p>}
              <button className="auth-submit" type="submit" disabled={busy}>{busy ? "A guardar…" : "Guardar palavra-passe"}</button>
            </form>
            <div className="auth-security"><span className="auth-lock" aria-hidden="true">⌑</span><span>A palavra-passe é enviada diretamente ao serviço de autenticação seguro.</span></div>
          </div>
          <footer className="auth-footer">PLATAFORMA FUTSAL <span>·</span> ACESSO SEGURO</footer>
        </section>
      </main>
    );
  }

  if (session && profileLoading) {
    return <main className="auth-loading"><span className="auth-spinner" /><p>A carregar o perfil e as permissões…</p></main>;
  }

  if (session && profileError) {
    return (
      <main className="auth-page">
        <section className="auth-panel">
          <div className="auth-form-wrap">
            <span className="eyebrow">VALIDAÇÃO DE CONTA</span>
            <h2>Não foi possível validar o acesso</h2>
            <p className="auth-feedback auth-error" role="alert">{profileError}</p>
            <button className="auth-submit" onClick={() => void supabase.auth.signOut()}>Terminar sessão</button>
          </div>
        </section>
      </main>
    );
  }

  if (session && profile && profile.status !== "ativo") {
    return (
      <main className="auth-page">
        <section className="auth-panel">
          <div className="auth-form-wrap">
            <span className="eyebrow">CONTA NÃO ATIVA</span>
            <h2>Acesso indisponível</h2>
            <p className="auth-feedback auth-error" role="alert">O estado desta conta é «{profile.status}». Contacta o administrador da plataforma.</p>
            <button className="auth-submit" onClick={() => void supabase.auth.signOut()}>Terminar sessão</button>
          </div>
        </section>
      </main>
    );
  }

  if (session && profile && !["administrador_principal", "treinador_principal", "staff", "jogadora"].includes(profile.role)) {
    return (
      <main className="auth-page">
        <section className="auth-panel">
          <div className="auth-form-wrap">
            <span className="eyebrow">ACESSO RESTRITO</span>
            <h2>Sem permissões para este painel</h2>
            <p className="auth-intro">Esta conta não tem um papel autorizado para aceder à plataforma.</p>
            <button className="auth-submit" onClick={() => void supabase.auth.signOut()}>Terminar sessão</button>
          </div>
        </section>
      </main>
    );
  }

  if (session && profile) return <Dashboard profile={profile} />;

  return (
    <main className="auth-page">
      <section className="auth-visual" aria-label="Plataforma privada de futsal">
        <a className="brand auth-brand" href="#login" aria-label="Plataforma Futsal"><span className="brand-mark">PF</span><span><strong>PLATAFORMA</strong><small>FUTSAL</small></span></a>
        <div className="auth-visual-copy"><span className="eyebrow">GESTÃO · ANÁLISE · EVOLUÇÃO</span><h1>O jogo prepara-se muito antes do apito inicial.</h1><p>Um espaço privado para organizar, acompanhar e desenvolver todas as dimensões da equipa.</p></div>
        <div className="auth-court-art" aria-hidden="true"><span /><i /><b /></div>
        <span className="auth-visual-foot">ACESSO EXCLUSIVO A UTILIZADORES AUTORIZADOS</span>
      </section>
      <section className="auth-panel" id="login">
        <div className="auth-form-wrap">
          <span className="eyebrow">BEM-VINDO DE VOLTA</span><h2>Iniciar sessão</h2><p className="auth-intro">Introduz as tuas credenciais para acederes à plataforma.</p>
          <form className="auth-form" onSubmit={handleLogin}>
            <label htmlFor="auth-email">Email</label><input id="auth-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nome@exemplo.pt" required />
            <div className="auth-password-label"><label htmlFor="auth-password">Palavra-passe</label><button type="button" onClick={() => void handlePasswordReset()} disabled={busy}>Esqueceste-te?</button></div>
            <div className="auth-password-field"><input id="auth-password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Introduz a tua palavra-passe" required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}>{showPassword ? "Ocultar" : "Mostrar"}</button></div>
            {error && <p className="auth-feedback auth-error" role="alert">{error}</p>}
            {message && <p className="auth-feedback auth-success" role="status">{message}</p>}
            <button className="auth-submit" type="submit" disabled={busy}>{busy ? "A processar…" : "Entrar na plataforma"}</button>
          </form>
          <div className="auth-security"><span className="auth-lock" aria-hidden="true">⌑</span><span>Acesso privado. As contas são criadas apenas por convite ou configuração autorizada.</span></div>
          <p className="auth-no-account">Não tens acesso? Contacta o administrador da plataforma.</p>
        </div>
        <footer className="auth-footer">PLATAFORMA FUTSAL <span>·</span> ACESSO SEGURO</footer>
      </section>
    </main>
  );
}

export default function App() {
  return <AuthGate />;
}

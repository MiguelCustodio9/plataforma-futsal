import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";

type SecurityAccount = {
  id: string;
  display_name: string;
  email: string;
  role: string;
  status: string;
  email_confirmed: boolean;
  last_sign_in_at: string | null;
  banned_until: string | null;
};

type SecurityEvent = {
  id: string;
  source: "acessos" | "configuracoes" | "staff";
  event_type: string;
  actor_name: string;
  target_name: string;
  detail: string;
  created_at: string;
};

const roleLabels: Record<string, string> = {
  administrador_principal: "Administrador Principal",
  treinador_principal: "Treinador Principal",
  staff: "Staff",
  jogadora: "Jogadora",
};

const eventLabels: Record<string, string> = {
  account_suspended: "Conta suspensa",
  account_reactivated: "Conta reativada",
  account_invited: "Convite criado",
  account_invite_resent: "Convite reenviado",
  account_deleted: "Conta eliminada",
  invite_resent: "Convite reenviado",
  setting_changed: "Configuração alterada",
};

function dateLabel(value: string | null | undefined) {
  if (!value) return "Nunca";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-PT");
}

export function SecurityActivity() {
  const [accounts, setAccounts] = useState<SecurityAccount[]>([]);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("todos");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("manage-platform-access", {
        body: { action: "security_overview" },
      });
      if (invokeError) {
        if (invokeError.context instanceof Response) {
          try {
            const payload = await invokeError.context.clone().json() as { error?: string };
            if (payload.error) throw new Error(payload.error);
          } catch (readError) {
            if (readError instanceof Error && readError.message !== "Unexpected end of JSON input") throw readError;
          }
        }
        throw invokeError;
      }
      if (!data || !Array.isArray(data.accounts) || !Array.isArray(data.events)) {
        throw new Error("Resposta inválida do serviço de segurança.");
      }
      setAccounts(data.accounts as SecurityAccount[]);
      setEvents(data.events as SecurityEvent[]);
    } catch (loadError) {
      console.error("Erro ao carregar segurança e atividade:", loadError);
      setError(loadError instanceof Error && loadError.message !== "Edge Function returned a non-2xx status code"
        ? loadError.message
        : "Não foi possível carregar os dados de segurança. Confirma se a função e a migration estão atualizadas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const filteredAccounts = useMemo(() => accounts.filter((account) =>
    [account.display_name, account.email, roleLabels[account.role] ?? account.role]
      .join(" ").toLocaleLowerCase("pt-PT").includes(query.toLocaleLowerCase("pt-PT"))),
  [accounts, query]);

  const filteredEvents = useMemo(() => events.filter((event) =>
    (eventFilter === "todos" || event.source === eventFilter) &&
    [event.event_type, event.actor_name, event.target_name, event.detail]
      .join(" ").toLocaleLowerCase("pt-PT").includes(query.toLocaleLowerCase("pt-PT"))),
  [events, eventFilter, query]);

  const counts = useMemo(() => ({
    total: accounts.length,
    active: accounts.filter((account) => account.status === "ativo" && !account.banned_until).length,
    suspended: accounts.filter((account) => account.status === "suspenso" || Boolean(account.banned_until)).length,
    unconfirmed: accounts.filter((account) => !account.email_confirmed).length,
  }), [accounts]);

  return (
    <div className="content security-content">
      <div className="staff-heading">
        <div><span className="eyebrow">ADMINISTRAÇÃO PRINCIPAL · PROTEÇÃO</span><h2>Segurança e atividade</h2><p>Consulta o estado de segurança das contas e o histórico de operações administrativas.</p></div>
        <button type="button" className="secondary-button" onClick={() => void loadData()} disabled={loading}>↻ Atualizar</button>
      </div>
      {error && <div className="security-alert" role="alert">{error}<button type="button" className="secondary-button" onClick={() => void loadData()}>Tentar novamente</button></div>}
      <section className="security-stats" aria-label="Resumo de segurança">
        <article><span>Contas registadas</span><strong>{loading ? "—" : counts.total}</strong></article>
        <article><span>Contas ativas</span><strong>{loading ? "—" : counts.active}</strong></article>
        <article><span>Contas suspensas</span><strong>{loading ? "—" : counts.suspended}</strong></article>
        <article><span>Email por confirmar</span><strong>{loading ? "—" : counts.unconfirmed}</strong></article>
      </section>
      <section className="security-section">
        <div className="security-section-heading"><div><h3>Estado das contas</h3><p>Estado da plataforma, confirmação do email e último acesso registado pelo Supabase Auth.</p></div><label className="security-search"><span>Pesquisar</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, email ou perfil…" /></label></div>
        {loading ? <div className="empty-state"><strong>A carregar informação de segurança…</strong></div> : filteredAccounts.length === 0 ? <div className="empty-state"><strong>Não foram encontradas contas.</strong></div> : (
          <div className="security-table-wrap"><table className="security-table"><thead><tr><th>Conta</th><th>Perfil</th><th>Estado</th><th>Email</th><th>Último acesso</th></tr></thead><tbody>
            {filteredAccounts.map((account) => <tr key={account.id}>
              <td><strong>{account.display_name}</strong><span>{account.email || "Email indisponível"}</span></td>
              <td>{roleLabels[account.role] ?? account.role}</td>
              <td><span className={account.banned_until || account.status === "suspenso" ? "security-pill suspended" : account.status === "ativo" ? "security-pill active" : "security-pill pending"}>{account.banned_until || account.status === "suspenso" ? "Suspensa" : account.status === "ativo" ? "Ativa" : account.status === "arquivado" ? "Arquivada" : "Convite pendente"}</span></td>
              <td><span className={account.email_confirmed ? "security-email confirmed" : "security-email unconfirmed"}>{account.email_confirmed ? "Confirmado" : "Por confirmar"}</span></td>
              <td>{dateLabel(account.last_sign_in_at)}</td>
            </tr>)}
          </tbody></table></div>
        )}
      </section>
      <section className="security-section">
        <div className="security-section-heading"><div><h3>Registo de atividade</h3><p>Operações de gestão de acessos, alterações às configurações e operações Staff auditadas.</p></div><label className="security-filter"><span>Origem</span><select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)}><option value="todos">Todas</option><option value="acessos">Gestão de acessos</option><option value="configuracoes">Configurações</option><option value="staff">Operações Staff</option></select></label></div>
        {loading ? <div className="empty-state"><strong>A carregar atividade…</strong></div> : filteredEvents.length === 0 ? <div className="empty-state"><strong>Não existem registos para os filtros selecionados.</strong></div> : (
          <div className="security-activity-list">{filteredEvents.map((event) => <article className="security-event" key={event.id}>
            <span className={`security-event-icon ${event.source}`} aria-hidden="true">{event.source === "acessos" ? "◈" : event.source === "configuracoes" ? "⚙" : "◇"}</span>
            <div className="security-event-main"><strong>{eventLabels[event.event_type] ?? event.event_type.replaceAll("_", " ")}</strong><span>{event.detail || event.target_name || "Operação administrativa"}</span><small>Por {event.actor_name || "Utilizador não identificado"}{event.target_name ? ` · Alvo: ${event.target_name}` : ""}</small></div>
            <time dateTime={event.created_at}>{dateLabel(event.created_at)}</time>
          </article>)}</div>
        )}
      </section>
      <section className="security-note"><strong>Limites da informação disponível</strong><p>O último acesso corresponde ao registo disponibilizado pelo Supabase Auth; não representa uma lista de sessões ou dispositivos. Tentativas de início de sessão, histórico de IP/dispositivo e estado de autenticação de dois fatores não são apresentados porque ainda não estão instrumentados nesta plataforma. Não são inferidos nem simulados.</p></section>
    </div>
  );
}

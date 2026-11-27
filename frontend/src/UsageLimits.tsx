import { useCallback, useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

type UsagePoint = {
  timestamp: string | null;
  authRequests: number | null;
  realtimeRequests: number | null;
  restRequests: number | null;
  storageRequests: number | null;
};

type UsageMetrics = {
  apiRequestsCount: number | null;
  apiCounts: UsagePoint[];
  latest: UsagePoint | null;
  apiCountsAvailable: boolean;
  requestCountAvailable: boolean;
  retrievedAt: string;
};

type UsageResponse = {
  configured: boolean;
  status: "not_configured" | "permission_denied" | "token_invalid" | "provider_unavailable" | "available" | "partial";
  message: string;
  metrics: UsageMetrics | null;
};

const numberLabel = (value: number | null | undefined) =>
  value === null || value === undefined ? "Não disponibilizado" : new Intl.NumberFormat("pt-PT").format(value);

const dateLabel = (value: string | null) => {
  if (!value) return "Data indisponível";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data indisponível" : date.toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" });
};

export function UsageLimits() {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadUsage = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const { data: response, error: invokeError } = await supabase.functions.invoke("monitor-platform-usage", { body: {} });
      if (invokeError) throw invokeError;
      if (!response || typeof response.configured !== "boolean" || typeof response.status !== "string") {
        throw new Error("Resposta inválida do serviço de monitorização.");
      }
      setData(response as UsageResponse);
    } catch (loadError) {
      console.error("Erro ao consultar utilização da plataforma:", loadError);
      setError("Não foi possível consultar a utilização. Confirma se a Edge Function está publicada e tenta novamente.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadUsage(); }, [loadUsage]);

  const latest = data?.metrics?.latest ?? null;
  const cards = [
    { label: "Autenticação", value: latest?.authRequests ?? null, description: "Pedidos ao serviço de autenticação" },
    { label: "Base de dados / API", value: latest?.restRequests ?? null, description: "Pedidos REST registados" },
    { label: "Realtime", value: latest?.realtimeRequests ?? null, description: "Pedidos ao serviço Realtime" },
    { label: "Armazenamento", value: latest?.storageRequests ?? null, description: "Pedidos ao serviço Storage" },
  ];

  return (
    <div className="content usage-content">
      <div className="staff-heading">
        <div><span className="eyebrow">ADMINISTRAÇÃO PRINCIPAL · MONITORIZAÇÃO</span><h2>Utilização e limites</h2><p>Acompanha os indicadores disponibilizados pelo Supabase e identifica antecipadamente necessidades de capacidade.</p></div>
        <button type="button" className="secondary-button" onClick={() => void loadUsage(true)} disabled={loading || refreshing}>{refreshing ? "A atualizar…" : "↻ Atualizar"}</button>
      </div>

      {error && <div className="usage-alert" role="alert">{error}</div>}
      {loading ? <div className="empty-state"><strong>A consultar métricas do Supabase…</strong></div> : data && (
        <>
          <section className="usage-status-panel">
            <div className="usage-status-mark" aria-hidden="true">{data.status === "available" ? "✓" : data.status === "partial" ? "!" : "i"}</div>
            <div><strong>{data.status === "available" ? "Monitorização ligada" : data.status === "partial" ? "Monitorização parcial" : data.status === "not_configured" ? "Configuração pendente" : "Métricas indisponíveis"}</strong><p>{data.message}</p></div>
          </section>

          {data.metrics ? (
            <>
              <section className="usage-overview-grid" aria-label="Resumo de utilização">
                <article className="usage-overview-card usage-overview-featured"><span>Contagem agregada de pedidos à API</span><strong>{numberLabel(data.metrics.apiRequestsCount)}</strong><small>Valor devolvido pela Management API; não é uma percentagem de quota.</small></article>
                <article className="usage-overview-card"><span>Registos temporais recebidos</span><strong>{data.metrics.apiCounts.length}</strong><small>Observações devolvidas pelo fornecedor.</small></article>
              </section>

              <section className="usage-section">
                <div className="usage-section-heading"><div><h3>Pedidos por serviço</h3><p>Valores do registo mais recente disponibilizado pela Management API.</p></div></div>
                <div className="usage-metric-grid">
                  {cards.map((card) => <article className="usage-metric-card" key={card.label}><span>{card.label}</span><strong>{numberLabel(card.value)}</strong><small>{card.description}</small></article>)}
                </div>
              </section>

              <section className="usage-section">
                <div className="usage-section-heading"><div><h3>Histórico de utilização</h3><p>Até 31 observações recentes recebidas do fornecedor. Não são estimativas.</p></div></div>
                {data.metrics.apiCounts.length ? <div className="usage-history-list">{data.metrics.apiCounts.slice().reverse().map((point, index) => <article className="usage-history-row" key={point.timestamp ?? index}><time>{dateLabel(point.timestamp)}</time><span>Auth: <strong>{numberLabel(point.authRequests)}</strong></span><span>REST: <strong>{numberLabel(point.restRequests)}</strong></span><span>Realtime: <strong>{numberLabel(point.realtimeRequests)}</strong></span><span>Storage: <strong>{numberLabel(point.storageRequests)}</strong></span></article>)}</div> : <div className="empty-state"><strong>O fornecedor não devolveu observações históricas.</strong></div>}
              </section>
              <p className="usage-updated-at">Última consulta: {dateLabel(data.metrics.retrievedAt)}</p>
            </>
          ) : data.status === "not_configured" ? (
            <section className="usage-section usage-setup">
              <h3>Ativar a monitorização</h3>
              <ol>
                <li>Cria um token pessoal limitado a este projeto no Supabase.</li>
                <li>Concede apenas a permissão <code>Usage Analytics · Read</code> (âmbito <code>analytics_usage_read</code>).</li>
                <li>Em Project Settings → Edge Functions → Secrets, adiciona o segredo <code>SUPABASE_MANAGEMENT_READ_TOKEN</code> com o valor do token.</li>
                <li>Guarda o segredo e volta a carregar esta página. Não é necessário publicar novamente a função.</li>
              </ol>
              <p>O token nunca deve ser colocado no GitHub, no código frontend ou numa mensagem. Não partilhes o seu valor.</p>
            </section>
          ) : (
            <section className="usage-section"><p>Verifica a validade do token e confirma que tem apenas o âmbito de leitura de utilização indicado. Se o problema persistir, consulta o estado do serviço no painel Supabase.</p></section>
          )}
        </>
      )}

      <section className="usage-section usage-priority">
        <div className="usage-section-heading"><div><h3>Prioridade de proteção dos serviços</h3><p>Se um limite for atingido, a plataforma deve preservar primeiro as operações essenciais.</p></div></div>
        <ol><li>Autenticação e acessos</li><li>Base de dados e registos de jogos</li><li>Sincronização</li><li>Consulta e estatísticas</li><li>Documentos e fotografias</li><li>Vídeos</li><li>Serviços secundários</li></ol>
        <p>Não são executados upgrades, ativações pagas ou alterações de faturação. As métricas sem limite confirmado ou sem dados do fornecedor são apresentadas como indisponíveis, nunca como consumo zero.</p>
      </section>
    </div>
  );
}

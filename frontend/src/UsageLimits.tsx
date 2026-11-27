import { useCallback, useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

type UsagePoint = {
  timestamp: string | null;
  authRequests: number | null;
  realtimeRequests: number | null;
  restRequests: number | null;
  storageRequests: number | null;
};

type MonthlyUsageSnapshot = {
  snapshot_month: string;
  database_size_bytes: number | null;
  storage_size_bytes: number | null;
  api_requests_count: number | null;
  captured_at: string;
};

type EdgeFunctionUsage = {
  available: boolean;
  partial: boolean;
  status: "permission_denied" | "plan_restriction" | "rate_limited" | "available" | "unavailable";
  windowHours: number;
  invocations: number;
  serverErrors: number;
  clientWarnings: number;
  runtimeErrors: number | null;
  runtimeWarnings: number | null;
  runtimeEvents: number | null;
  functions: Array<{
    path: string;
    invocations: number;
    serverErrors: number;
    clientWarnings: number;
    averageExecutionTimeMs: number | null;
  }>;
  retrievedAt: string;
};

type UsageMetrics = {
  apiRequestsCount: number | null;
  apiCounts: UsagePoint[];
  latest: UsagePoint | null;
  apiCountsAvailable: boolean;
  requestCountAvailable: boolean;
  databaseSizeBytes: number | null;
  storageSizeBytes: number | null;
  storageSnapshotAvailable: boolean;
  monthlyHistory: MonthlyUsageSnapshot[];
  monthlyHistoryAvailable: boolean;
  edgeFunctionMonitoring: EdgeFunctionUsage;
  retrievedAt: string;
};

type FeatureUsagePoint = {
  feature_key: string;
  event_count: number;
};

type UsageResponse = {
  configured: boolean;
  status: "not_configured" | "permission_denied" | "token_invalid" | "provider_unavailable" | "available" | "partial";
  message: string;
  metrics: UsageMetrics | null;
};

const numberLabel = (value: number | null | undefined) =>
  value === null || value === undefined ? "Não disponibilizado" : new Intl.NumberFormat("pt-PT").format(value);

const bytesLabel = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Não disponibilizado";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return `${new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 }).format(size)} ${units[unit]}`;
};

const monthLabel = (value: string) => {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "Mês indisponível" : date.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
};

const dateLabel = (value: string | null) => {
  if (!value) return "Data indisponível";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data indisponível" : date.toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" });
};

const FREE_PLAN_LIMITS = {
  database: 500 * 1024 * 1024,
  storage: 1024 * 1024 * 1024,
} as const;

type UsageRisk = { label: string; tone: "normal" | "attention" | "high" | "critical" | "reached" | "unavailable" };

function usageRisk(value: number | null, limit: number): UsageRisk {
  if (value === null || !Number.isFinite(value)) return { label: "Indisponível", tone: "unavailable" };
  const percentage = value / limit * 100;
  if (percentage >= 100) return { label: "Limite atingido", tone: "reached" };
  if (percentage >= 95) return { label: "Crítico", tone: "critical" };
  if (percentage >= 85) return { label: "Elevado", tone: "high" };
  if (percentage >= 70) return { label: "Atenção", tone: "attention" };
  return { label: "Normal", tone: "normal" };
}

function usageForecast(
  history: MonthlyUsageSnapshot[],
  metric: "database_size_bytes" | "storage_size_bytes",
  currentValue: number | null,
  limit: number,
): string {
  if (currentValue === null || !Number.isFinite(currentValue)) return "Sem dados atuais para estimar.";
  if (currentValue >= limit) return "O limite já foi atingido; não existe tempo restante para estimar.";
  const ordered = [...history].sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime());
  if (ordered.length < 2) return "Disponível após existirem registos de pelo menos dois meses distintos.";
  const previous = ordered[ordered.length - 2];
  const latest = ordered[ordered.length - 1];
  const previousValue = previous[metric];
  const latestValue = latest[metric];
  const elapsedDays = (new Date(latest.captured_at).getTime() - new Date(previous.captured_at).getTime()) / 86400000;
  if (previousValue === null || latestValue === null || !Number.isFinite(elapsedDays) || elapsedDays <= 0) {
    return "Ainda não existem observações suficientes para calcular uma tendência.";
  }
  const growthPerDay = (latestValue - previousValue) / elapsedDays;
  if (growthPerDay <= 0) return "Não foi observado crescimento nos dois últimos registos.";
  const daysRemaining = Math.ceil((limit - currentValue) / growthPerDay);
  return `Previsão: cerca de ${daysRemaining.toLocaleString("pt-PT")} dias até ao limite, mantendo o ritmo observado.`;
}

export function UsageLimits() {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [featureUsage, setFeatureUsage] = useState<FeatureUsagePoint[]>([]);
  const [featureUsageAvailable, setFeatureUsageAvailable] = useState(false);

  const loadUsage = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [monitorResult, featureResult] = await Promise.all([
        supabase.functions.invoke("monitor-platform-usage", { body: {} }),
        supabase.rpc("get_platform_feature_usage"),
      ]);
      const { data: response, error: invokeError } = monitorResult;
      if (invokeError) throw invokeError;
      setFeatureUsageAvailable(!featureResult.error && Array.isArray(featureResult.data));
      setFeatureUsage(Array.isArray(featureResult.data) ? featureResult.data as FeatureUsagePoint[] : []);
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
    { label: "API REST", value: latest?.restRequests ?? null, description: "Pedidos REST registados" },
    { label: "Realtime", value: latest?.realtimeRequests ?? null, description: "Pedidos ao serviço Realtime" },
    { label: "Armazenamento", value: latest?.storageRequests ?? null, description: "Pedidos ao serviço Storage" },
  ];

  const quotaMetrics = [
    { key: "database" as const, label: "Base de dados", value: data?.metrics?.databaseSizeBytes ?? null, limit: FREE_PLAN_LIMITS.database, historyKey: "database_size_bytes" as const },
    { key: "storage" as const, label: "Storage", value: data?.metrics?.storageSizeBytes ?? null, limit: FREE_PLAN_LIMITS.storage, historyKey: "storage_size_bytes" as const },
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
                <div className="usage-section-heading"><div><h3>Utilização por funcionalidade</h3><p>Contagem agregada de aberturas das áreas nos últimos 30 dias. Não identifica utilizadores nem guarda conteúdo.</p></div></div>
                {featureUsageAvailable ? (
                  featureUsage.length ? (
                    <div className="usage-metric-grid">
                      {featureUsage.map((feature) => {
                        const labels: Record<string, string> = {
                          dashboard: "Painel inicial",
                          staff: "Gestão de Staff",
                          access_management: "Gestão de acessos",
                          platform_settings: "Configurações da plataforma",
                          security_activity: "Segurança e atividade",
                          usage_limits: "Utilização e limites",
                        };
                        return <article className="usage-metric-card" key={feature.feature_key}><span>{labels[feature.feature_key] ?? "Outra funcionalidade"}</span><strong>{numberLabel(feature.event_count)}</strong><small>Aberturas registadas · últimos 30 dias</small></article>;
                      })}
                    </div>
                  ) : (
                    <div className="empty-state"><strong>Ainda não existem dados de utilização por funcionalidade.</strong><p>Os registos começam a ser acumulados quando as áreas são abertas após a aplicação da migration.</p></div>
                  )
                ) : (
                  <div className="empty-state"><strong>Indicador temporariamente indisponível.</strong><p>Confirma se a migration de métricas por funcionalidade já foi aplicada.</p></div>
                )}
                <p className="usage-quota-note">Este indicador mede a frequência de utilização das áreas, não o consumo direto de CPU, memória ou tráfego. É uma referência de utilização e não uma medição de custo.</p>
              </section>

              <section className="usage-section">
                <div className="usage-section-heading"><div><h3>Ocupação atual</h3><p>Leitura direta da base de dados e dos ficheiros registados no Storage; não representa a média faturável do ciclo.</p></div></div>
                <div className="usage-metric-grid">
                  <article className="usage-metric-card"><span>Base de dados</span><strong>{bytesLabel(data.metrics.databaseSizeBytes)}</strong><small>Dimensão atual da base de dados PostgreSQL.</small></article>
                  <article className="usage-metric-card"><span>Storage</span><strong>{bytesLabel(data.metrics.storageSizeBytes)}</strong><small>Soma dos tamanhos dos objetos registados nos buckets.</small></article>
                </div>
              </section>

              <section className="usage-section">
                <div className="usage-section-heading"><div><h3>Avisos preventivos e previsão</h3><p>Comparação indicativa com as quotas do plano gratuito Supabase. Os avisos são informativos e não ativam serviços pagos.</p></div></div>
                <div className="usage-quota-grid">
                  {quotaMetrics.map((metric) => {
                    const percentage = metric.value === null ? null : metric.value / metric.limit * 100;
                    const risk = usageRisk(metric.value, metric.limit);
                    const history = data.metrics?.monthlyHistory ?? [];
                    return <article className={`usage-quota-card usage-risk-${risk.tone}`} key={metric.key}>
                      <div className="usage-quota-heading"><span>{metric.label}</span><strong>{risk.label}</strong></div>
                      <div className="usage-quota-values"><strong>{bytesLabel(metric.value)}</strong><span>de {bytesLabel(metric.limit)}</span></div>
                      <div className="usage-quota-track" role="progressbar" aria-label={`Utilização da quota de ${metric.label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage === null ? 0 : Math.min(100, Math.max(0, percentage))}>
                        <span style={{ width: `${percentage === null ? 0 : Math.min(100, Math.max(0, percentage))}%` }} />
                      </div>
                      <div className="usage-quota-footer"><span>{percentage === null ? "Percentagem indisponível" : `${new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1 }).format(percentage)}% utilizado`}</span></div>
                      <p className="usage-forecast">{usageForecast(history, metric.historyKey, metric.value, metric.limit)}</p>
                    </article>;
                  })}
                </div>
                <p className="usage-quota-note">Referências do plano gratuito: base de dados até 500 MB por projeto e Storage até 1 GB. A ocupação apresentada é uma leitura atual, não a média faturável do ciclo. Os limites podem ser alterados pelo fornecedor; não é efetuada qualquer atualização paga ou alteração de plano.</p>
              </section>

              <section className="usage-section">
                <div className="usage-section-heading"><div><h3>Histórico mensal persistente</h3><p>Uma observação por mês, atualizada quando consultas a monitorização. Mantém até 12 meses de registos.</p></div></div>
                {data.metrics.monthlyHistory?.length ? <div className="usage-history-list">{data.metrics.monthlyHistory.map((point) => <article className="usage-history-row" key={point.snapshot_month}><time>{monthLabel(point.snapshot_month)}</time><span>Base de dados: <strong>{bytesLabel(point.database_size_bytes)}</strong></span><span>Storage: <strong>{bytesLabel(point.storage_size_bytes)}</strong></span><span>Pedidos API: <strong>{numberLabel(point.api_requests_count)}</strong></span><span>Atualizado: <strong>{dateLabel(point.captured_at)}</strong></span></article>)}</div> : <div className="empty-state"><strong>Ainda não existem registos mensais.</strong><p>O primeiro registo será criado quando a migration estiver aplicada e a próxima consulta for concluída.</p></div>}
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
              <section className="usage-section">
                <div className="usage-section-heading"><div><h3>Edge Functions e incidentes</h3><p>Invocações e eventos das funções nas últimas 24 horas, consultados diretamente nos registos do Supabase. São apresentados apenas totais agregados e tempos médios.</p></div></div>
                {data.metrics.edgeFunctionMonitoring.available || data.metrics.edgeFunctionMonitoring.partial ? (
                  <>
                    <div className="usage-metric-grid">
                      <article className="usage-metric-card"><span>Invocações</span><strong>{numberLabel(data.metrics.edgeFunctionMonitoring.invocations)}</strong><small>Pedidos recebidos pelas Edge Functions · 24 horas</small></article>
                      <article className="usage-metric-card"><span>Erros HTTP 5xx</span><strong>{numberLabel(data.metrics.edgeFunctionMonitoring.serverErrors)}</strong><small>Falhas do lado do servidor</small></article>
                      <article className="usage-metric-card"><span>Avisos HTTP 4xx</span><strong>{numberLabel(data.metrics.edgeFunctionMonitoring.clientWarnings)}</strong><small>Pedidos recusados ou inválidos</small></article>
                      <article className="usage-metric-card"><span>Erros de execução</span><strong>{numberLabel(data.metrics.edgeFunctionMonitoring.runtimeErrors)}</strong><small>Eventos error/fatal emitidos no runtime</small></article>
                      <article className="usage-metric-card"><span>Avisos de execução</span><strong>{numberLabel(data.metrics.edgeFunctionMonitoring.runtimeWarnings)}</strong><small>Eventos warn/warning emitidos no runtime</small></article>
                    </div>
                    {data.metrics.edgeFunctionMonitoring.functions.length ? (
                      <div className="usage-history-list">
                        {data.metrics.edgeFunctionMonitoring.functions.map((fn) => (
                          <article className="usage-history-row" key={fn.path}>
                            <strong>{fn.path}</strong>
                            <span>Invocações: <strong>{numberLabel(fn.invocations)}</strong></span>
                            <span>Erros 5xx: <strong>{numberLabel(fn.serverErrors)}</strong></span>
                            <span>Avisos 4xx: <strong>{numberLabel(fn.clientWarnings)}</strong></span>
                            <span>Tempo médio: <strong>{fn.averageExecutionTimeMs === null ? "Não disponibilizado" : String(numberLabel(fn.averageExecutionTimeMs)) + " ms"}</strong></span>
                          </article>
                        ))}
                      </div>
                    ) : <div className="empty-state"><strong>Sem invocações registadas no período consultado.</strong></div>}
                    {data.metrics.edgeFunctionMonitoring.partial && <p className="usage-quota-note">Monitorização parcial: nem todas as fontes de registos responderam.</p>}
                  </>
                ) : (
                  <div className="empty-state">
                    <strong>{data.metrics.edgeFunctionMonitoring.status === "permission_denied" ? "Permissão de leitura de registos em falta." : data.metrics.edgeFunctionMonitoring.status === "plan_restriction" ? "O fornecedor não disponibilizou esta consulta no plano atual." : data.metrics.edgeFunctionMonitoring.status === "rate_limited" ? "Limite temporário de consultas atingido." : "Registos das Edge Functions indisponíveis."}</strong>
                    <p>Confirma a permissão <code>analytics_logs_read</code> no token e tenta novamente. Não é apresentado conteúdo bruto dos registos.</p>
                  </div>
                )}
                <p className="usage-quota-note">O intervalo de consulta é limitado às últimas 24 horas pela Management API. Os corpos dos pedidos/respostas e mensagens completas dos logs não são apresentados.</p>
              </section>

              <section className="usage-section usage-not-yet-measured"><strong>Indicadores ainda não ligados</strong><p>Utilizadores ativos mensais, transferência de dados, invocações de Edge Functions e métricas de sincronização ainda não estão ligados. A ocupação atual da base de dados e do Storage só aparece quando a consulta agregada está disponível. Estes valores não são confundidos com as médias de consumo usadas pelo Supabase para faturação.</p></section>
              <p className="usage-updated-at">Última consulta: {dateLabel(data.metrics.retrievedAt)}</p>
            </>
          ) : data.status === "not_configured" ? (
            <section className="usage-section usage-setup">
              <h3>Ativar a monitorização</h3>
              <ol>
                <li>Cria um token pessoal limitado a este projeto no Supabase.</li>
                <li>Concede apenas a permissão <code>Usage Analytics · Read</code> (âmbito <code>analytics_usage_read</code>).</li>
                <li>Em Project Settings → Edge Functions → Secrets, adiciona o segredo <code>MANAGEMENT_READ_TOKEN</code> com o valor do token.</li>
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

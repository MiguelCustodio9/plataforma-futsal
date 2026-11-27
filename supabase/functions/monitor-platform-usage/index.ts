import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";

const allowedOrigin = Deno.env.get("APP_ALLOWED_ORIGIN") ?? "https://miguelcustodio9.github.io";
const projectRef = "tuimyjeuykecyxbawwlz";
const corsHeaders = {
  "access-control-allow-origin": allowedOrigin,
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "content-type": "application/json",
  "cache-control": "no-store",
  vary: "Origin",
};

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

type MonthlySnapshot = {
  snapshot_month: string;
  database_size_bytes: number | null;
  storage_size_bytes: number | null;
  api_requests_count: number | null;
  captured_at: string;
};

type UsagePoint = {
  timestamp?: string;
  total_auth_requests?: number;
  total_realtime_requests?: number;
  total_rest_requests?: number;
  total_storage_requests?: number;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    if (request.headers.get("origin") !== allowedOrigin) return new Response(null, { status: 403 });
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST" || request.headers.get("origin") !== allowedOrigin) {
    return respond(403, { error: "Pedido não autorizado." });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const managementToken = Deno.env.get("MANAGEMENT_READ_TOKEN") ?? "";
  if (!token || !supabaseUrl || !anonKey) return respond(401, { error: "Sessão inválida." });

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return respond(401, { error: "Sessão inválida." });

  const managerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: manager, error: managerError } = await managerClient.from("profiles")
    .select("role, status").eq("id", authData.user.id).maybeSingle();
  if (managerError || !manager || manager.role !== "administrador_principal" || manager.status !== "ativo") {
    return respond(403, { error: "Apenas o Administrador Principal com conta ativa pode consultar a utilização." });
  }

  if (!managementToken) {
    return respond(200, {
      configured: false,
      status: "not_configured",
      message: "A monitorização ainda não está configurada. Adiciona o segredo de leitura no Supabase.",
      metrics: null,
    });
  }

  const headers = { Authorization: `Bearer ${managementToken}`, Accept: "application/json" };
  const endpoints = [
    fetch(`https://api.supabase.com/v1/projects/${projectRef}/analytics/endpoints/usage.api-counts`, { headers }),
    fetch(`https://api.supabase.com/v1/projects/${projectRef}/analytics/endpoints/usage.api-requests-count`, { headers }),
  ];
  const [apiCountsResponse, requestCountResponse] = await Promise.all(endpoints);
  const apiCounts = apiCountsResponse.ok ? await apiCountsResponse.json().catch(() => null) : null;
  const requestCount = requestCountResponse.ok ? await requestCountResponse.json().catch(() => null) : null;

  const requestCountValue = Array.isArray(requestCount?.result) && requestCount.result.length
    && Number.isFinite(requestCount.result[0]?.count) ? requestCount.result[0].count : null;

  let databaseSizeBytes: number | null = null;
  let storageSizeBytes: number | null = null;
  let monthlyHistory: MonthlySnapshot[] = [];
  if (!serviceRoleKey) {
    console.error("[monitor-platform-usage] SUPABASE_SERVICE_ROLE_KEY não está disponível no ambiente da função.");
  }
  if (serviceRoleKey) {
    const metricsClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: snapshot, error: snapshotError } = await metricsClient
      .rpc("get_platform_usage_storage_snapshot").maybeSingle();
    if (snapshotError) {
      console.error("[monitor-platform-usage] Falha na consulta de ocupação:", snapshotError.message);
    }
    if (!snapshotError && snapshot) {
      databaseSizeBytes = snapshot.database_size_bytes !== null && snapshot.database_size_bytes !== undefined
        && Number.isFinite(Number(snapshot.database_size_bytes)) ? Number(snapshot.database_size_bytes) : null;
      storageSizeBytes = snapshot.storage_size_bytes !== null && snapshot.storage_size_bytes !== undefined
        && Number.isFinite(Number(snapshot.storage_size_bytes)) ? Number(snapshot.storage_size_bytes) : null;
    }
    const { data: historyRows, error: historyError } = await metricsClient.rpc(
      "record_platform_usage_monthly_snapshot",
      {
        p_database_size_bytes: databaseSizeBytes,
        p_storage_size_bytes: storageSizeBytes,
        p_api_requests_count: requestCountValue,
      },
    );
    if (historyError) {
      console.error("[monitor-platform-usage] Falha ao gravar/ler histórico mensal:", historyError.message, historyError.code ?? "sem código");
    } else if (Array.isArray(historyRows)) {
      monthlyHistory = historyRows.filter((row: MonthlySnapshot) => row && typeof row.snapshot_month === "string");
    } else {
      console.error("[monitor-platform-usage] A função SQL do histórico não devolveu uma lista.");
    }
  }


  type FunctionUsageRow = {
    function_path?: string;
    invocation_count?: number | string;
    server_errors?: number | string;
    client_warnings?: number | string;
    avg_execution_time_ms?: number | string;
  };
  type RuntimeLogRow = { runtime_errors?: number | string; runtime_warnings?: number | string; runtime_events?: number | string };
  const logEnd = new Date();
  const logStart = new Date(logEnd.getTime() - 24 * 60 * 60 * 1000);
  const logParams = (sql: string) => {
    const params = new URLSearchParams({
      sql,
      iso_timestamp_start: logStart.toISOString(),
      iso_timestamp_end: logEnd.toISOString(),
    });
    return `https://api.supabase.com/v1/projects/${projectRef}/analytics/endpoints/logs?${params.toString()}`;
  };
  const functionStatsSql = `
    SELECT
      log_attributes['request.pathname'] AS function_path,
      count() AS invocation_count,
      countIf(toInt32OrZero(log_attributes['response.status_code']) >= 500) AS server_errors,
      countIf(toInt32OrZero(log_attributes['response.status_code']) >= 400 AND toInt32OrZero(log_attributes['response.status_code']) < 500) AS client_warnings,
      round(avg(toFloat64OrZero(log_attributes['execution_time_ms'])), 2) AS avg_execution_time_ms
    FROM logs
    WHERE source = 'function_edge_logs'
    GROUP BY function_path
    ORDER BY invocation_count DESC
    LIMIT 50
  `;
  const runtimeStatsSql = `
    SELECT
      countIf(lowerUTF8(log_attributes['level']) IN ('error', 'fatal') OR upperUTF8(severity_text) IN ('ERROR', 'FATAL')) AS runtime_errors,
      countIf(lowerUTF8(log_attributes['level']) IN ('warn', 'warning') OR upperUTF8(severity_text) = 'WARNING') AS runtime_warnings,
      count() AS runtime_events
    FROM logs
    WHERE source = 'function_logs'
  `;
  const [functionLogsResponse, runtimeLogsResponse] = await Promise.all([
    fetch(logParams(functionStatsSql), { headers }),
    fetch(logParams(runtimeStatsSql), { headers }),
  ]);
  const functionLogsPayload = functionLogsResponse.ok ? await functionLogsResponse.json().catch(() => null) : null;
  const runtimeLogsPayload = runtimeLogsResponse.ok ? await runtimeLogsResponse.json().catch(() => null) : null;
  const functionRows: FunctionUsageRow[] = Array.isArray(functionLogsPayload?.result)
    ? functionLogsPayload.result.filter((row: FunctionUsageRow) => row && typeof row === "object")
    : [];
  const runtimeRow: RuntimeLogRow | null = Array.isArray(runtimeLogsPayload?.result)
    ? runtimeLogsPayload.result[0] ?? null
    : null;
  const edgeLogsAvailable = functionLogsResponse.ok && !functionLogsPayload?.error;
  const runtimeLogsAvailable = runtimeLogsResponse.ok && !runtimeLogsPayload?.error;
  const edgeFunctionMonitoring = {
    available: edgeLogsAvailable && runtimeLogsAvailable,
    partial: edgeLogsAvailable !== runtimeLogsAvailable,
    functionLogsHttpStatus: functionLogsResponse.status,
    runtimeLogsHttpStatus: runtimeLogsResponse.status,
    status: [functionLogsResponse.status, runtimeLogsResponse.status].includes(403) ? "permission_denied"
      : [functionLogsResponse.status, runtimeLogsResponse.status].includes(402) ? "plan_restriction"
      : [functionLogsResponse.status, runtimeLogsResponse.status].includes(429) ? "rate_limited"
      : edgeLogsAvailable || runtimeLogsAvailable ? "available" : "unavailable",
    windowHours: 24,
    invocations: functionRows.reduce((sum, row) => sum + (Number(row.invocation_count) || 0), 0),
    serverErrors: functionRows.reduce((sum, row) => sum + (Number(row.server_errors) || 0), 0),
    clientWarnings: functionRows.reduce((sum, row) => sum + (Number(row.client_warnings) || 0), 0),
    runtimeErrors: runtimeRow ? Number(runtimeRow.runtime_errors) || 0 : null,
    runtimeWarnings: runtimeRow ? Number(runtimeRow.runtime_warnings) || 0 : null,
    runtimeEvents: runtimeRow ? Number(runtimeRow.runtime_events) || 0 : null,
    functions: functionRows.map((row) => ({
      path: typeof row.function_path === "string" ? row.function_path : "Função sem identificação",
      invocations: Number(row.invocation_count) || 0,
      serverErrors: Number(row.server_errors) || 0,
      clientWarnings: Number(row.client_warnings) || 0,
      averageExecutionTimeMs: Number.isFinite(Number(row.avg_execution_time_ms)) ? Number(row.avg_execution_time_ms) : null,
    })),
    retrievedAt: logEnd.toISOString(),
  };

  const points = Array.isArray(apiCounts?.result)
    ? apiCounts.result.filter((point: UsagePoint) => point && typeof point === "object").slice(-31)
    : [];
  const normalizedPoints = points.map((point: UsagePoint) => ({
    timestamp: typeof point.timestamp === "string" ? point.timestamp : null,
    authRequests: Number.isFinite(point.total_auth_requests) ? point.total_auth_requests : null,
    realtimeRequests: Number.isFinite(point.total_realtime_requests) ? point.total_realtime_requests : null,
    restRequests: Number.isFinite(point.total_rest_requests) ? point.total_rest_requests : null,
    storageRequests: Number.isFinite(point.total_storage_requests) ? point.total_storage_requests : null,
  }));
  const apiCountsAvailable = apiCountsResponse.ok && normalizedPoints.length > 0;
  const requestCountAvailable = requestCountResponse.ok && requestCountValue !== null;

  if (!apiCountsAvailable && !requestCountAvailable) {
    const status = [apiCountsResponse.status, requestCountResponse.status].includes(403) ? "permission_denied"
      : [apiCountsResponse.status, requestCountResponse.status].includes(401) ? "token_invalid"
      : "provider_unavailable";
    return respond(200, {
      configured: true,
      status,
      message: status === "permission_denied"
        ? "O token não tem a permissão de leitura de utilização necessária."
        : status === "token_invalid"
          ? "O token de leitura foi recusado. Verifica a validade e o âmbito do token."
          : "O serviço de métricas não disponibilizou dados neste momento.",
      metrics: null,
    });
  }

  return respond(200, {
    configured: true,
    status: apiCountsAvailable && requestCountAvailable ? "available" : "partial",
    message: apiCountsAvailable && requestCountAvailable
      ? "Métricas recebidas diretamente da Management API do Supabase."
      : "Apenas parte das métricas foi disponibilizada pela Management API.",
    metrics: {
      apiRequestsCount: requestCountAvailable ? requestCountValue : null,
      apiCounts: normalizedPoints,
      latest: normalizedPoints.at(-1) ?? null,
      apiCountsAvailable,
      requestCountAvailable,
      databaseSizeBytes,
      storageSizeBytes,
      storageSnapshotAvailable: databaseSizeBytes !== null && storageSizeBytes !== null,
      monthlyHistory,
      monthlyHistoryAvailable: monthlyHistory.length > 0,
      edgeFunctionMonitoring,
      retrievedAt: new Date().toISOString(),
    },
  });
});

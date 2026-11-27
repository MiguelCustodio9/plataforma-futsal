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
  const managementToken = Deno.env.get("SUPABASE_MANAGEMENT_READ_TOKEN") ?? "";
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
  const requestCountValue = Array.isArray(requestCount?.result) && requestCount.result.length
    && Number.isFinite(requestCount.result[0]?.count) ? requestCount.result[0].count : null;
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
      retrievedAt: new Date().toISOString(),
    },
  });
});

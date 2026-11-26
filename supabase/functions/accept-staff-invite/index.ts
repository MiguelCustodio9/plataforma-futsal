import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";

const allowedOrigin = Deno.env.get("APP_ALLOWED_ORIGIN") ?? "https://miguelcustodio9.github.io";
const corsHeaders = {
  "access-control-allow-origin": allowedOrigin,
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "content-type": "application/json",
  vary: "Origin",
};

function respond(status: number, body: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

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
  if (!token || !supabaseUrl || !anonKey || !serviceRoleKey) return respond(401, { error: "Sessão inválida." });

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user || !authData.user.email) return respond(401, { error: "Sessão inválida." });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: profile, error: profileReadError } = await admin.from("profiles")
    .select("role, status").eq("id", authData.user.id).maybeSingle();
  if (profileReadError) {
    console.error("Erro ao consultar perfil durante ativação de convite:", profileReadError);
    return respond(500, {
      error: "Não foi possível validar o perfil.",
      diagnostic: [profileReadError.code, profileReadError.message].filter(Boolean).join(" — "),
    });
  }
  if (!profile || !["staff", "treinador_principal"].includes(profile.role) || profile.status !== "convite_pendente") {
    return respond(409, { error: "Não existe um convite pendente válido para esta conta." });
  }

  const { data: member, error: memberReadError } = await admin.from("staff_members")
    .select("id, email").eq("profile_id", authData.user.id).maybeSingle();
  if (memberReadError) {
    console.error("Erro ao consultar ficha Staff durante ativação de convite:", memberReadError);
    return respond(500, {
      error: "Não foi possível validar a ficha Staff.",
      diagnostic: [memberReadError.code, memberReadError.message].filter(Boolean).join(" — "),
    });
  }
  if (!member || member.email.toLowerCase() !== authData.user.email.toLowerCase()) {
    return respond(403, { error: "O convite não corresponde a esta conta." });
  }

  const { error: profileUpdateError } = await admin.from("profiles")
    .update({ status: "ativo" }).eq("id", authData.user.id);
  if (profileUpdateError) {
    console.error("Erro ao ativar perfil após convite:", profileUpdateError);
    return respond(500, {
      error: "Não foi possível ativar o perfil.",
      diagnostic: [profileUpdateError.code, profileUpdateError.message, profileUpdateError.details].filter(Boolean).join(" — "),
    });
  }

  const { error: memberUpdateError } = await admin.from("staff_members")
    .update({ status: "ativo" }).eq("id", member.id);
  if (memberUpdateError) {
    console.error("Erro ao ativar ficha Staff após convite:", memberUpdateError);
    await admin.from("profiles").update({ status: "convite_pendente" }).eq("id", authData.user.id);
    return respond(500, {
      error: "Não foi possível concluir a ativação do Staff.",
      diagnostic: [memberUpdateError.code, memberUpdateError.message, memberUpdateError.details].filter(Boolean).join(" — "),
    });
  }

  return respond(200, { message: profile.role === "treinador_principal" ? "Conta de Treinador Principal ativada." : "Conta de Staff ativada." });
});

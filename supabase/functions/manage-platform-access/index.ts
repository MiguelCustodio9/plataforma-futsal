import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";

const allowedOrigin = Deno.env.get("APP_ALLOWED_ORIGIN") ?? "https://miguelcustodio9.github.io";
const corsHeaders = {
  "access-control-allow-origin": allowedOrigin,
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "content-type": "application/json",
  vary: "Origin",
};

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

type AccountStatus = "ativo" | "convite_pendente" | "suspenso" | "arquivado";
const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

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
  if (!token || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return respond(401, { error: "Sessão inválida ou serviço não configurado." });
  }

  const authClient = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return respond(401, { error: "Sessão inválida." });

  const managerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: manager, error: managerError } = await managerClient.from("profiles")
    .select("role, status").eq("id", authData.user.id).maybeSingle();
  if (managerError || !manager || manager.role !== "administrador_principal" || manager.status !== "ativo") {
    return respond(403, { error: "Apenas o Administrador Principal com conta ativa pode gerir os acessos globais." });
  }

  let payload: { action?: unknown; targetProfileId?: unknown; status?: unknown; displayName?: unknown; email?: unknown };
  try { payload = await request.json(); } catch { return respond(400, { error: "Pedido inválido." }); }

  if (payload.action === "create_trainer_principal") {
    const displayName = typeof payload.displayName === "string" ? payload.displayName.trim() : "";
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    if (!displayName || displayName.length > 120 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) || email.length > 320) {
      return respond(400, { error: "Indica um nome e um endereço de email válido." });
    }

    const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { display_name: displayName },
      redirectTo: Deno.env.get("APP_REDIRECT_URL") ?? "https://miguelcustodio9.github.io/plataforma-futsal/",
    });
    if (inviteError || !invitation.user) {
      console.error("Erro ao convidar Treinador Principal:", inviteError?.message);
      return respond(409, { error: inviteError?.message ?? "Não foi possível enviar o convite. Confirma se o email já está associado a uma conta." });
    }

    const invitedUserId = invitation.user.id;
    const { error: profileError } = await admin.from("profiles").insert({
      id: invitedUserId,
      display_name: displayName,
      role: "treinador_principal",
      status: "convite_pendente",
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(invitedUserId);
      console.error("Erro ao criar perfil de Treinador Principal:", profileError.message);
      return respond(500, { error: "O convite não pôde ser associado ao perfil. O acesso foi invalidado." });
    }

    const { data: staffMember, error: staffError } = await admin.from("staff_members").insert({
      profile_id: invitedUserId,
      name: displayName,
      full_name: displayName,
      email,
      status: "convite_enviado",
      created_by: authData.user.id,
    }).select("id").single();
    if (staffError || !staffMember) {
      await admin.from("profiles").delete().eq("id", invitedUserId);
      await admin.auth.admin.deleteUser(invitedUserId);
      console.error("Erro ao criar ficha Staff do Treinador Principal:", staffError?.message);
      return respond(500, { error: "Não foi possível criar a ficha Staff. O convite foi invalidado." });
    }

    const { error: roleError } = await admin.from("staff_member_roles").insert({
      staff_member_id: staffMember.id,
      role_name: "Treinador Principal",
    });
    if (roleError) {
      await admin.from("staff_members").delete().eq("id", staffMember.id);
      await admin.from("profiles").delete().eq("id", invitedUserId);
      await admin.auth.admin.deleteUser(invitedUserId);
      console.error("Erro ao atribuir função de Treinador Principal:", roleError.message);
      return respond(500, { error: "Não foi possível atribuir a função. O convite foi invalidado." });
    }

    const { error: auditError } = await admin.from("platform_access_audit").insert({
      target_profile_id: invitedUserId,
      actor_profile_id: authData.user.id,
      event_type: "account_invited",
      previous_status: "convite_pendente",
      new_status: "convite_pendente",
    });
    if (auditError) {
      console.error("Convite criado, mas a auditoria falhou:", auditError.message);
      return respond(500, { error: "A conta foi criada, mas não foi possível concluir o registo de auditoria." });
    }
    return respond(200, { message: "Convite de Treinador Principal enviado com sucesso." });
  }

  if (payload.action === "list") {
    const { data: profiles, error: profilesError } = await admin.from("profiles")
      .select("id, display_name, role, status, created_at")
      .order("created_at", { ascending: false });
    if (profilesError) {
      console.error("Erro ao listar perfis:", profilesError.message);
      return respond(500, { error: "Não foi possível carregar as contas da plataforma." });
    }

    const users: { id: string; email?: string; last_sign_in_at?: string }[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
      if (error) {
        console.error("Erro ao listar utilizadores Auth:", error.message);
        return respond(502, { error: "Não foi possível obter os emails das contas." });
      }
      users.push(...data.users.map((user) => ({
        id: user.id,
        email: user.email ?? "",
        last_sign_in_at: user.last_sign_in_at ?? "",
      })));
      if (data.users.length < 100) break;
    }

    const userById = new Map(users.map((user) => [user.id, user]));
    const accounts = (profiles ?? []).map((profile) => {
      const authUser = userById.get(profile.id);
      return {
        id: profile.id,
        display_name: profile.display_name,
        email: authUser?.email ?? "",
        role: profile.role,
        status: profile.status,
        created_at: profile.created_at,
        last_sign_in_at: authUser?.last_sign_in_at ?? "",
      };
    });
    return respond(200, { accounts });
  }

  if (payload.action !== "set_status" || !isUuid(payload.targetProfileId) ||
      !["ativo", "suspenso"].includes(String(payload.status))) {
    return respond(400, { error: "Operação ou conta inválida." });
  }

  const targetProfileId = payload.targetProfileId;
  const nextStatus = payload.status as "ativo" | "suspenso";
  if (targetProfileId === authData.user.id) {
    return respond(409, { error: "Não podes suspender ou alterar o estado da tua própria conta." });
  }

  const { data: target, error: targetError } = await admin.from("profiles")
    .select("id, role, status").eq("id", targetProfileId).maybeSingle();
  if (targetError || !target) return respond(404, { error: "Conta não encontrada." });
  if (target.status === nextStatus) return respond(409, { error: "A conta já se encontra nesse estado." });
  if (target.status === "arquivado" || target.status === "convite_pendente") {
    return respond(409, { error: "O estado desta conta não permite esta operação." });
  }

  if (target.role === "administrador_principal" && nextStatus === "suspenso") {
    const { count, error: countError } = await admin.from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "administrador_principal").eq("status", "ativo");
    if (countError || (count ?? 0) <= 1) {
      return respond(409, { error: "Não é possível suspender o último Administrador Principal ativo." });
    }
  }

  const { error: authUpdateError } = await admin.auth.admin.updateUserById(targetProfileId, {
    ban_duration: nextStatus === "suspenso" ? "876000h" : "none",
  });
  if (authUpdateError) {
    console.error("Erro ao atualizar bloqueio Auth:", authUpdateError.message);
    return respond(502, { error: "Não foi possível atualizar o acesso à autenticação." });
  }

  const { error: profileUpdateError } = await admin.from("profiles")
    .update({ status: nextStatus }).eq("id", targetProfileId);
  if (profileUpdateError) {
    await admin.auth.admin.updateUserById(targetProfileId, {
      ban_duration: target.status === "suspenso" ? "876000h" : "none",
    });
    console.error("Erro ao atualizar estado do perfil:", profileUpdateError.message);
    return respond(500, { error: "Não foi possível guardar o novo estado da conta." });
  }

  const { error: auditError } = await admin.from("platform_access_audit").insert({
    target_profile_id: targetProfileId,
    actor_profile_id: authData.user.id,
    event_type: nextStatus === "suspenso" ? "account_suspended" : "account_reactivated",
    previous_status: target.status as AccountStatus,
    new_status: nextStatus,
  });
  if (auditError) {
    console.error("Alteração aplicada, mas a auditoria falhou:", auditError.message);
    return respond(500, { error: "O estado foi alterado, mas não foi possível concluir o registo de auditoria." });
  }

  return respond(200, { message: nextStatus === "suspenso" ? "Conta suspensa." : "Conta reativada." });
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";

const allowedOrigin = Deno.env.get("APP_ALLOWED_ORIGIN") ?? "https://miguelcustodio9.github.io";
const headers = { "access-control-allow-origin": allowedOrigin, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "authorization, apikey, content-type, x-client-info", "content-type": "application/json", vary: "Origin" };
const respond = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers });
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return request.headers.get("origin") === allowedOrigin ? new Response("ok", {headers}) : new Response(null,{status:403});
  if (request.method !== "POST" || request.headers.get("origin") !== allowedOrigin) return respond(403,{error:"Pedido não autorizado."});
  const token=(request.headers.get("authorization")??"").replace(/^Bearer /,"");
  const url=Deno.env.get("SUPABASE_URL")??"", anon=Deno.env.get("SUPABASE_ANON_KEY")??"", key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
  if(!token||!url||!anon||!key)return respond(401,{error:"Sessão inválida ou serviço não configurado."});
  const auth=createClient(url,anon,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:authData,error:authError}=await auth.auth.getUser(token);
  if(authError||!authData.user)return respond(401,{error:"Sessão inválida."});
  const managerClient=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{autoRefreshToken:false,persistSession:false}});
  const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:manager}=await managerClient.from("profiles").select("role,status").eq("id",authData.user.id).maybeSingle();
  if(!manager||manager.role!=="treinador_principal"||manager.status!=="ativo")return respond(403,{error:"Apenas o Treinador Principal ativo pode gerir contas de jogadoras."});
  let p:{action?:unknown;playerId?:unknown;email?:unknown;displayName?:unknown;status?:unknown};
  try{p=await request.json();}catch{return respond(400,{error:"Pedido inválido."});}
  if(!isUuid(p.playerId))return respond(400,{error:"Ficha de atleta inválida."});
  const {data:player,error:playerError}=await admin.from("players").select("id,name,full_name,profile_id").eq("id",p.playerId).maybeSingle();
  if(playerError||!player)return respond(404,{error:"Ficha de atleta não encontrada."});
  const audit=async(profileId:string|null,event:string,details:Record<string,unknown>={})=>{
    const {error}=await admin.from("platform_access_audit").insert({target_profile_id:profileId,actor_profile_id:authData.user.id,event_type:event,details:{player_id:player.id,display_name:player.name,...details}});
    return error;
  };
  if(p.action==="invite"){
    if(player.profile_id)return respond(409,{error:"Esta atleta já tem uma conta associada."});
    const email=typeof p.email==="string"?p.email.trim().toLowerCase():"";
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>320)return respond(400,{error:"Indica um email válido para a conta da atleta."});
    const displayName=player.name;
    const {data:inv,error:invError}=await admin.auth.admin.inviteUserByEmail(email,{data:{display_name:displayName,invite_kind:"player"},redirectTo:Deno.env.get("APP_REDIRECT_URL")??"https://miguelcustodio9.github.io/plataforma-futsal/"});
    if(invError||!inv.user)return respond(409,{error:invError?.message??"Não foi possível enviar o convite. Confirma se o email já está associado a uma conta."});
    const uid=inv.user.id;
    const {error:profileError}=await admin.from("profiles").insert({id:uid,display_name:displayName,role:"jogadora",status:"convite_pendente"});
    if(profileError){await admin.auth.admin.deleteUser(uid);return respond(500,{error:"O convite não pôde ser associado ao perfil. Foi invalidado."});}
    const {error:linkError}=await admin.from("players").update({profile_id:uid}).eq("id",player.id);
    if(linkError){await admin.from("profiles").delete().eq("id",uid);await admin.auth.admin.deleteUser(uid);return respond(500,{error:"Não foi possível associar a conta à atleta. O convite foi invalidado."});}
    const ae=await audit(uid,"player_account_invited",{email});
    if(ae){await admin.from("players").update({profile_id:null}).eq("id",player.id);await admin.from("profiles").delete().eq("id",uid);await admin.auth.admin.deleteUser(uid);return respond(500,{error:"Falhou o registo de auditoria. O convite foi revertido."});}
    return respond(200,{message:"Convite enviado. A atleta receberá um email para ativar a conta e definir a palavra-passe."});
  }
  if(!player.profile_id)return respond(409,{error:"Esta atleta não tem uma conta associada."});
  const uid=player.profile_id;
  const {data:target,error:targetError}=await admin.from("profiles").select("id,role,status").eq("id",uid).maybeSingle();
  if(targetError||!target||target.role!=="jogadora")return respond(409,{error:"A conta associada não é uma conta de jogadora válida."});
  if(p.action==="set_status"){
    if(!["ativo","suspenso"].includes(String(p.status)))return respond(400,{error:"Estado inválido."});
    const next=p.status as "ativo"|"suspenso";
    if(target.status==="convite_pendente"||target.status==="arquivado")return respond(409,{error:"O estado atual não permite esta operação."});
    if(target.status===next)return respond(409,{error:"A conta já está nesse estado."});
    const {error:authUpdate}=await admin.auth.admin.updateUserById(uid,{ban_duration:next==="suspenso"?"876000h":"none"});
    if(authUpdate)return respond(502,{error:"Não foi possível alterar o acesso de autenticação."});
    const {error:updateError}=await admin.from("profiles").update({status:next}).eq("id",uid);
    if(updateError){await admin.auth.admin.updateUserById(uid,{ban_duration:target.status==="suspenso"?"876000h":"none"});return respond(500,{error:"Não foi possível guardar o estado da conta."});}
    const ae=await audit(uid,next==="suspenso"?"player_account_suspended":"player_account_reactivated",{previous_status:target.status,new_status:next});
    if(ae)return respond(500,{error:"O estado foi alterado, mas falhou o registo de auditoria."});
    return respond(200,{message:next==="suspenso"?"Conta da atleta suspensa.":"Conta da atleta reativada."});
  }
  if(p.action==="update_email"){
    const email=typeof p.email==="string"?p.email.trim().toLowerCase():"";
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>320)return respond(400,{error:"Indica um email válido."});
    const {error:updateError}=await admin.auth.admin.updateUserById(uid,{email,email_confirm:false});
    if(updateError)return respond(409,{error:updateError.message});
    const ae=await audit(uid,"player_account_email_updated",{email});
    if(ae)return respond(500,{error:"Email atualizado, mas falhou o registo de auditoria."});
    return respond(200,{message:"Email de acesso atualizado. A atleta terá de confirmar o novo endereço."});
  }
  if(p.action==="delete"){
    const {error:detachError}=await admin.from("players").update({profile_id:null}).eq("id",player.id);
    if(detachError)return respond(500,{error:"Não foi possível preservar a ficha antes de eliminar a conta."});
    const {error:deleteError}=await admin.auth.admin.deleteUser(uid);
    if(deleteError){await admin.from("players").update({profile_id:uid}).eq("id",player.id);return respond(502,{error:"Não foi possível eliminar a conta. A associação foi reposta."});}
    const ae=await audit(null,"player_account_deleted",{email:"",previous_profile_id:uid});
    if(ae)return respond(500,{error:"Conta eliminada e ficha preservada, mas falhou a auditoria."});
    return respond(200,{message:"Conta de acesso eliminada. A ficha e o histórico desportivo foram preservados."});
  }
  return respond(400,{error:"Operação desconhecida."});
});

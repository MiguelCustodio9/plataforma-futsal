import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "./lib/supabase";

type PlayerStatus = "ativa" | "lesionada" | "inativa" | "arquivada";
type Player = {
  id: string; name: string; full_name: string; sex: string; positions: string[];
  birth_date: string; birth_country: string | null; birth_locality: string | null;
  nationality: string; second_nationality: string | null; dominant_foot: string;
  preferred_number: number | null; practice_years: number | null;
  previous_club: string | null; other_sports: string | null;
  abdominal_perimeter: number | null; photo_path: string | null; status: PlayerStatus;
  contact_phone: string | null; contact_email: string | null;
};
type Guardian = { id?: string; full_name: string; relationship: string; phone: string; email: string };
type CareerEntry = { id?: string; club_name: string; team_name: string; season_label: string; start_date: string; end_date: string };
const positions = ["GR", "Fixo", "Ala", "Pivot", "Universal"];
const statusLabels: Record<PlayerStatus, string> = {
  ativa: "Ativa", lesionada: "Lesionada", inativa: "Inativa", arquivada: "Arquivada",
};
const emptyForm = {
  name: "", full_name: "", sex: "Feminino", positions: [] as string[], birth_date: "",
  birth_country: "", birth_locality: "", nationality: "Portuguesa", second_nationality: "",
  dominant_foot: "Direito", preferred_number: "", practice_years: "", previous_club: "",
  other_sports: "", abdominal_perimeter: "", status: "ativa" as PlayerStatus,
  contact_phone: "", contact_email: "",
};
const emptyGuardian = (): Guardian => ({ full_name: "", relationship: "", phone: "", email: "" });
const emptyCareer = (): CareerEntry => ({ club_name: "", team_name: "", season_label: "", start_date: "", end_date: "" });

function ageFromDate(date: string) {
  if (!date) return "—";
  const birth = new Date(`${date}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--;
  return age >= 0 ? String(age) : "—";
}

export function PlayerRoster({ canManage }: { canManage: boolean }) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todas");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Player | null>(null);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [careerHistory, setCareerHistory] = useState<CareerEntry[]>([]);
  const [detailGuardians, setDetailGuardians] = useState<Guardian[]>([]);
  const [detailCareer, setDetailCareer] = useState<CareerEntry[]>([]);

  const loadPlayers = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const { data, error: loadError } = await supabase.from("players")
        .select("id,name,full_name,sex,positions,birth_date,birth_country,birth_locality,nationality,second_nationality,dominant_foot,preferred_number,practice_years,previous_club,other_sports,abdominal_perimeter,photo_path,status,contact_phone,contact_email")
        .order("name", { ascending: true });
      if (loadError) throw loadError;
      setPlayers((data ?? []) as Player[]);
    } catch (loadError) {
      console.error("Erro ao carregar Plantel:", loadError);
      setError("Não foi possível carregar o Plantel. Confirma se a migration do módulo foi aplicada e se tens permissões.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadPlayers(); }, [loadPlayers]);

  const filtered = useMemo(() => players.filter((player) =>
    [player.name, player.full_name, player.nationality, ...player.positions].join(" ").toLocaleLowerCase("pt-PT")
      .includes(query.toLocaleLowerCase("pt-PT")) &&
    (statusFilter === "Todas" || player.status === statusFilter)
  ), [players, query, statusFilter]);

  const loadRelated = async (playerId: string) => {
    const [gr, cr] = await Promise.all([
      supabase.from("player_guardians").select("id,full_name,relationship,phone,email").eq("player_id", playerId).order("created_at"),
      supabase.from("player_career_history").select("id,club_name,team_name,season_label,start_date,end_date").eq("player_id", playerId).order("start_date", { ascending: true }),
    ]);
    if (gr.error) throw gr.error;
    if (cr.error) throw cr.error;
    return {
      guardians: (gr.data ?? []).map((x: any) => ({...x,phone:x.phone ?? "",email:x.email ?? ""})) as Guardian[],
      career: (cr.data ?? []).map((x: any) => ({...x,team_name:x.team_name ?? "",season_label:x.season_label ?? "",start_date:x.start_date ?? "",end_date:x.end_date ?? ""})) as CareerEntry[],
    };
  };
  const openNew = () => {
    setEditingId(null); setForm(emptyForm); setGuardians([emptyGuardian()]); setCareerHistory([]);
    setFormError(""); setShowForm(true);
  };
  const openEdit = async (player: Player) => {
    setEditingId(player.id);
    try {
      const related = await loadRelated(player.id);
      setGuardians(related.guardians.length ? related.guardians : [emptyGuardian()]);
      setCareerHistory(related.career);
      setForm({...emptyForm,name:player.name,full_name:player.full_name,sex:player.sex,positions:player.positions ?? [],
        birth_date:player.birth_date,birth_country:player.birth_country ?? "",birth_locality:player.birth_locality ?? "",
        nationality:player.nationality,second_nationality:player.second_nationality ?? "",dominant_foot:player.dominant_foot,
        preferred_number:player.preferred_number?.toString() ?? "",practice_years:player.practice_years?.toString() ?? "",
        previous_club:player.previous_club ?? "",other_sports:player.other_sports ?? "",
        abdominal_perimeter:player.abdominal_perimeter?.toString() ?? "",status:player.status,
        contact_phone:player.contact_phone ?? "",contact_email:player.contact_email ?? ""});
      setFormError(""); setShowForm(true);
    } catch (e) {
      console.error("Erro ao carregar contactos e percurso:",e);
      setError("Não foi possível carregar os contactos e o histórico da jogadora.");
    }
  };

  const togglePosition = (position: string) => setForm((current) => {
    const next = current.positions.includes(position) ? current.positions.filter((item) => item !== position) : [...current.positions, position];
    return { ...current, positions: position === "Universal" ? (next.includes("Universal") ? ["Universal"] : []) : next.filter((item) => item !== "Universal") };
  });

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setFormError("");
    if (!form.name.trim() || !form.full_name.trim() || !form.birth_date || !form.nationality.trim() || !form.positions.length) {
      setFormError("Preenche o nome apresentado, nome completo, data de nascimento, nacionalidade e pelo menos uma posição."); return;
    }
    const number = form.preferred_number ? Number(form.preferred_number) : null;
    const years = form.practice_years ? Number(form.practice_years) : null;
    const perimeter = form.abdominal_perimeter ? Number(form.abdominal_perimeter.replace(",", ".")) : null;
    if (number !== null && (!Number.isInteger(number) || number < 1 || number > 99)) { setFormError("O número preferido deve estar entre 1 e 99."); return; }
    if (years !== null && (!Number.isInteger(years) || years < 0 || years > 80)) { setFormError("Confirma os anos de prática."); return; }
    if (perimeter !== null && (!Number.isFinite(perimeter) || perimeter <= 0 || perimeter > 300)) { setFormError("Confirma o perímetro abdominal em centímetros."); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), full_name: form.full_name.trim(), sex: form.sex, positions: form.positions,
        birth_date: form.birth_date, birth_country: form.birth_country.trim() || null,
        birth_locality: form.birth_locality.trim() || null, nationality: form.nationality.trim(),
        second_nationality: form.second_nationality.trim() || null, dominant_foot: form.dominant_foot,
        preferred_number: number, practice_years: years, previous_club: form.previous_club.trim() || null,
        other_sports: form.other_sports.trim() || null, abdominal_perimeter: perimeter, status: form.status,
        contact_phone: form.contact_phone.trim() || null, contact_email: form.contact_email.trim() || null,
      };
      let playerId = editingId;
      if (editingId) {
        const result = await supabase.from("players").update(payload).eq("id", editingId);
        if (result.error) throw result.error;
      } else {
        const result = await supabase.from("players").insert(payload).select("id").single();
        if (result.error) throw result.error;
        playerId = result.data.id;
      }
      if (!playerId) throw new Error("ID da jogadora indisponível.");
      const guardianRows = guardians.filter(g=>g.full_name.trim() && g.relationship.trim()).map(g=>({
        ...(g.id ? {id:g.id}:{}),player_id:playerId,full_name:g.full_name.trim(),relationship:g.relationship.trim(),
        phone:g.phone.trim() || null,email:g.email.trim() || null
      }));
      const careerRows = careerHistory.filter(h=>h.club_name.trim()).map(h=>({
        ...(h.id ? {id:h.id}:{}),player_id:playerId,club_name:h.club_name.trim(),team_name:h.team_name.trim() || null,
        season_label:h.season_label.trim() || null,start_date:h.start_date || null,end_date:h.end_date || null
      }));
      const syncRows = async (table:"player_guardians"|"player_career_history",rows:Array<Record<string,unknown>>) => {
        const ids=rows.flatMap(row=>typeof row.id==="string" ? [row.id] : []);
        let del=supabase.from(table).delete().eq("player_id",playerId);
        if(ids.length) del=del.not("id","in","("+ids.join(",")+")");
        const deleted=await del;if(deleted.error)throw deleted.error;
        if(rows.length){const saved=await supabase.from(table).upsert(rows);if(saved.error)throw saved.error;}
      };
      await Promise.all([syncRows("player_guardians",guardianRows),syncRows("player_career_history",careerRows)]);
      await loadPlayers(); setShowForm(false); setSelected(null);
    } catch (saveError) {
      console.error("Erro ao guardar jogadora:", saveError);
      setFormError("Não foi possível guardar a ficha. Verifica os dados e as permissões do Treinador Principal.");
    } finally { setSaving(false); }
  };

  const openDetails = async (player: Player) => {
    setSelected(player);
    try { const related=await loadRelated(player.id);setDetailGuardians(related.guardians);setDetailCareer(related.career); }
    catch(e){console.error("Erro ao carregar detalhe:",e);setError("Não foi possível carregar todos os dados da ficha.");}
  };

  const archive = async (player: Player) => {
    if (!window.confirm(`Queres arquivar a ficha de ${player.name}? O registo histórico será preservado.`)) return;
    const { error: archiveError } = await supabase.from("players").update({ status: "arquivada" }).eq("id", player.id);
    if (archiveError) { setError("Não foi possível arquivar a ficha."); return; }
    setSelected(null); await loadPlayers();
  };

  return <main className="content roster-content">
    <div className="staff-heading">
      <div><span className="eyebrow">GESTÃO DESPORTIVA · JOGADORAS</span><h2>Plantel</h2><p>Fichas desportivas permanentes, com consulta pela equipa técnica e gestão exclusiva do Treinador Principal.</p></div>
      <div className="staff-heading-actions"><button className="secondary-button" onClick={() => void loadPlayers()} disabled={loading}>↻ Atualizar</button>{canManage && <button className="primary-button" onClick={openNew}>+ Adicionar jogadora</button>}</div>
    </div>
    <section className="staff-stats roster-stats" aria-label="Resumo do Plantel">
      <article><span>Total de fichas</span><strong>{players.length}</strong></article>
      <article><span>Ativas</span><strong>{players.filter(p => p.status === "ativa").length}</strong></article>
      <article><span>Lesionadas</span><strong>{players.filter(p => p.status === "lesionada").length}</strong></article>
      <article><span>Inativas / arquivadas</span><strong>{players.filter(p => p.status === "inativa" || p.status === "arquivada").length}</strong></article>
    </section>
    <section className="staff-toolbar" aria-label="Pesquisa e filtros do Plantel">
      <label className="search-field"><span>Pesquisar</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Nome, nacionalidade ou posição..." /></label>
      <label><span>Estado</span><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="Todas">Todos os estados</option>{Object.entries(statusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </section>
    {loading ? <div className="empty-state"><strong>A carregar Plantel…</strong></div> : error && players.length === 0 ? <div className="empty-state"><strong>{error}</strong><button className="secondary-button" onClick={() => void loadPlayers()}>Tentar novamente</button></div> : filtered.length === 0 ? <div className="empty-state"><strong>Não existem jogadoras para apresentar.</strong><span>{canManage ? "Adiciona a primeira ficha ou altera os filtros." : "As fichas serão apresentadas quando forem criadas pelo Treinador Principal."}</span></div> :
      <section className="staff-list roster-list" aria-label="Lista de jogadoras">
        <div className="staff-row roster-row roster-table-head"><span>Jogadora</span><span>Posição</span><span>Idade</span><span>Estado</span><span>Ações</span></div>
        {filtered.map(player => <article className="staff-row roster-row" key={player.id}>
          <div className="staff-person"><span className="staff-avatar">{player.name.split(" ").map(p => p[0]).slice(0,2).join("").toLocaleUpperCase("pt-PT")}</span><div><strong>{player.name}</strong><span>{player.nationality} · #{player.preferred_number ?? "—"}</span></div></div>
          <div className="staff-roles"><span>{player.positions.join(" / ")}</span></div><div>{ageFromDate(player.birth_date)}</div>
          <div><span className={`status-pill status-${player.status}`}>{statusLabels[player.status]}</span></div>
          <div className="staff-actions roster-actions"><button onClick={() => void openDetails(player)}>Consultar</button>{canManage && <button onClick={() => openEdit(player)}>Editar</button>}</div>
        </article>)}
      </section>}
    {!canManage && <p className="demo-notice">O Staff pode consultar as fichas. Apenas o Treinador Principal pode criar, editar ou alterar o estado das jogadoras.</p>}
    {showForm && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !saving) setShowForm(false); }}>
      <section className="staff-modal roster-modal" role="dialog" aria-modal="true" aria-labelledby="player-form-title">
        <div className="modal-heading"><div><span className="eyebrow">FICHA DESPORTIVA PERMANENTE</span><h2 id="player-form-title">{editingId ? "Editar jogadora" : "Adicionar jogadora"}</h2></div><button className="icon-button" onClick={() => setShowForm(false)} aria-label="Fechar" disabled={saving}>×</button></div>
        <form onSubmit={save}>
          <div className="roster-form-section"><h3>Identificação</h3><div className="form-grid">
            <label><span>Nome apresentado *</span><input value={form.name} onChange={e => setForm({...form,name:e.target.value})} required maxLength={120}/></label>
            <label><span>Nome completo *</span><input value={form.full_name} onChange={e => setForm({...form,full_name:e.target.value})} required maxLength={200}/></label>
            <label><span>Sexo *</span><select value={form.sex} onChange={e => setForm({...form,sex:e.target.value})}><option>Feminino</option><option>Masculino</option><option>Outro</option></select></label>
            <label><span>Data de nascimento *</span><input type="date" value={form.birth_date} onChange={e => setForm({...form,birth_date:e.target.value})} required/><small>Idade calculada automaticamente.</small></label>
            <label><span>País de nascimento</span><input value={form.birth_country} onChange={e => setForm({...form,birth_country:e.target.value})}/></label>
            <label><span>Localidade de nascimento</span><input value={form.birth_locality} onChange={e => setForm({...form,birth_locality:e.target.value})}/></label>
            <label><span>Nacionalidade *</span><input value={form.nationality} onChange={e => setForm({...form,nationality:e.target.value})} required/></label>
            <label><span>Segunda nacionalidade</span><input value={form.second_nationality} onChange={e => setForm({...form,second_nationality:e.target.value})}/></label>
          </div></div>
          <div className="roster-form-section"><h3>Contactos da atleta</h3><div className="form-grid">
            <label><span>Telemóvel</span><input type="tel" value={form.contact_phone} onChange={e=>setForm({...form,contact_phone:e.target.value})} maxLength={40}/></label>
            <label><span>Email</span><input type="email" value={form.contact_email} onChange={e=>setForm({...form,contact_email:e.target.value})} maxLength={254}/></label>
          </div></div>
          <div className="roster-form-section"><h3>Características desportivas</h3><div className="form-grid">
            <label><span>Pé dominante *</span><select value={form.dominant_foot} onChange={e => setForm({...form,dominant_foot:e.target.value})}><option>Direito</option><option>Esquerdo</option><option>Ambidestro</option></select></label>
            <label><span>Número preferido (1–99)</span><input type="number" min="1" max="99" value={form.preferred_number} onChange={e => setForm({...form,preferred_number:e.target.value})}/></label>
            <label><span>Anos de prática</span><input type="number" min="0" max="80" value={form.practice_years} onChange={e => setForm({...form,practice_years:e.target.value})}/></label>
            <label><span>Clube anterior</span><input value={form.previous_club} onChange={e => setForm({...form,previous_club:e.target.value})}/><small>A associação à lista central de clubes será ligada no módulo Clubes.</small></label>
            <label><span>Outros desportos/atividades</span><input value={form.other_sports} onChange={e => setForm({...form,other_sports:e.target.value})}/></label>
          </div><fieldset className="role-picker"><legend>Posições *</legend><div>{positions.map(position => <label key={position}><input type="checkbox" checked={form.positions.includes(position)} onChange={() => togglePosition(position)}/>{position}</label>)}</div><small>Universal é uma posição exclusiva e não pode ser combinada com outras.</small></fieldset></div>
          <div className="roster-form-section"><h3>Dados antropométricos</h3><div className="form-grid">
            <label><span>Perímetro abdominal (cm)</span><input type="number" min="0.1" max="300" step="0.1" value={form.abdominal_perimeter} onChange={e => setForm({...form,abdominal_perimeter:e.target.value})}/></label>
          </div><small>Este dado pertence aos parâmetros antropométricos/físicos, não às características desportivas.</small></div>
          <div className="roster-form-section"><div className="roster-section-heading"><h3>Encarregados de Educação</h3><button type="button" className="secondary-button" onClick={()=>setGuardians(v=>[...v,emptyGuardian()])}>+ Adicionar EE</button></div>
            <p className="field-note">Dados de contacto dos Encarregados de Educação. Não são criadas contas de acesso à plataforma.</p>
            {guardians.map((g,i)=><div className="roster-related-card" key={g.id ?? ("guardian-"+i)}><div className="form-grid">
              <label><span>Nome completo *</span><input value={g.full_name} onChange={e=>setGuardians(v=>v.map((x,j)=>j===i?{...x,full_name:e.target.value}:x))}/></label>
              <label><span>Parentesco *</span><input value={g.relationship} onChange={e=>setGuardians(v=>v.map((x,j)=>j===i?{...x,relationship:e.target.value}:x))} placeholder="Mãe, pai, tutor…"/></label>
              <label><span>Telemóvel</span><input type="tel" value={g.phone} onChange={e=>setGuardians(v=>v.map((x,j)=>j===i?{...x,phone:e.target.value}:x))}/></label>
              <label><span>Email</span><input type="email" value={g.email} onChange={e=>setGuardians(v=>v.map((x,j)=>j===i?{...x,email:e.target.value}:x))}/></label>
            </div><button type="button" className="text-danger-button" onClick={()=>setGuardians(v=>v.filter((_,j)=>j!==i))}>Remover EE</button></div>)}
          </div>
          <div className="roster-form-section"><div className="roster-section-heading"><h3>Histórico de carreira</h3><button type="button" className="secondary-button" onClick={()=>setCareerHistory(v=>[...v,emptyCareer()])}>+ Adicionar percurso</button></div>
            <p className="field-note">Clubes, equipas e épocas anteriores. A ligação à lista central de clubes será integrada no módulo Clubes.</p>
            {careerHistory.map((h,i)=><div className="roster-related-card" key={h.id ?? ("career-"+i)}><div className="form-grid">
              <label><span>Clube *</span><input value={h.club_name} onChange={e=>setCareerHistory(v=>v.map((x,j)=>j===i?{...x,club_name:e.target.value}:x))}/></label>
              <label><span>Equipa</span><input value={h.team_name} onChange={e=>setCareerHistory(v=>v.map((x,j)=>j===i?{...x,team_name:e.target.value}:x))}/></label>
              <label><span>Época</span><input value={h.season_label} onChange={e=>setCareerHistory(v=>v.map((x,j)=>j===i?{...x,season_label:e.target.value}:x))} placeholder="2024/2025"/></label>
              <label><span>Data de início</span><input type="date" value={h.start_date} onChange={e=>setCareerHistory(v=>v.map((x,j)=>j===i?{...x,start_date:e.target.value}:x))}/></label>
              <label><span>Data de fim</span><input type="date" value={h.end_date} onChange={e=>setCareerHistory(v=>v.map((x,j)=>j===i?{...x,end_date:e.target.value}:x))}/></label>
            </div><button type="button" className="text-danger-button" onClick={()=>setCareerHistory(v=>v.filter((_,j)=>j!==i))}>Remover registo</button></div>)}
          </div>
          <div className="roster-form-section"><h3>Estado desportivo</h3><label className="roster-status-field"><span>Estado</span><select value={form.status} onChange={e => setForm({...form,status:e.target.value as PlayerStatus})}>{Object.entries(statusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowForm(false)} disabled={saving}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "A guardar…" : "Guardar ficha"}</button></div>
        </form>
      </section>
    </div>}
    {selected && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null); }}>
      <section className="staff-modal roster-detail-modal" role="dialog" aria-modal="true" aria-labelledby="player-detail-title">
        <div className="modal-heading"><div><span className="eyebrow">FICHA DESPORTIVA</span><h2 id="player-detail-title">{selected.name}</h2></div><button className="icon-button" onClick={() => setSelected(null)} aria-label="Fechar">×</button></div>
        <div className="roster-detail-grid">
          <div><span>Nome completo</span><strong>{selected.full_name}</strong></div><div><span>Idade</span><strong>{ageFromDate(selected.birth_date)}</strong></div>
          <div><span>Sexo</span><strong>{selected.sex}</strong></div><div><span>Data de nascimento</span><strong>{new Date(selected.birth_date+"T00:00:00").toLocaleDateString("pt-PT")}</strong></div>
          <div><span>Naturalidade</span><strong>{[selected.birth_locality,selected.birth_country].filter(Boolean).join(", ") || "—"}</strong></div>
          <div><span>Nacionalidade</span><strong>{[selected.nationality,selected.second_nationality].filter(Boolean).join(" / ")}</strong></div>
          <div><span>Contactos da atleta</span><strong>{[selected.contact_phone,selected.contact_email].filter(Boolean).join(" · ") || "—"}</strong></div>
          <div><span>Posições</span><strong>{selected.positions.join(" / ")}</strong></div><div><span>Pé dominante</span><strong>{selected.dominant_foot}</strong></div>
          <div><span>Número preferido</span><strong>{selected.preferred_number ?? "—"}</strong></div><div><span>Anos de prática</span><strong>{selected.practice_years ?? "—"}</strong></div>
          <div><span>Clube anterior</span><strong>{selected.previous_club || "—"}</strong></div><div><span>Outros desportos/atividades</span><strong>{selected.other_sports || "—"}</strong></div>
          <div><span>Estado</span><strong>{statusLabels[selected.status]}</strong></div>
        </div>
        <div className="roster-detail-related"><h3>Dados antropométricos</h3><div><strong>Perímetro abdominal</strong><span>{selected.abdominal_perimeter == null ? "—" : `${selected.abdominal_perimeter} cm`}</span></div></div>
        <div className="roster-detail-related"><h3>Encarregados de Educação</h3>{detailGuardians.length ? detailGuardians.map(g=><div key={g.id}><strong>{g.full_name}</strong><span>{g.relationship} · {[g.phone,g.email].filter(Boolean).join(" · ")}</span></div>) : <p>Sem Encarregados de Educação registados.</p>}</div>
        <div className="roster-detail-related"><h3>Histórico de carreira</h3>{detailCareer.length ? detailCareer.map(h=><div key={h.id}><strong>{h.club_name}</strong><span>{[h.team_name,h.season_label,[h.start_date,h.end_date].filter(Boolean).join(" – ")].filter(Boolean).join(" · ")}</span></div>) : <p>Sem histórico de carreira registado.</p>}</div>
        <div className="modal-actions">{canManage && <button className="danger-button" onClick={() => void archive(selected)}>Arquivar ficha</button>}<button className="secondary-button" onClick={() => setSelected(null)}>Fechar</button></div>
      </section>
    </div>}
  </main>;
}

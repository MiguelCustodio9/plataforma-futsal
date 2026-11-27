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
};
const positions = ["GR", "Fixo", "Ala", "Pivot", "Universal"];
const statusLabels: Record<PlayerStatus, string> = {
  ativa: "Ativa", lesionada: "Lesionada", inativa: "Inativa", arquivada: "Arquivada",
};
const emptyForm = {
  name: "", full_name: "", sex: "Feminino", positions: [] as string[], birth_date: "",
  birth_country: "", birth_locality: "", nationality: "Portuguesa", second_nationality: "",
  dominant_foot: "Direito", preferred_number: "", practice_years: "", previous_club: "",
  other_sports: "", abdominal_perimeter: "", status: "ativa" as PlayerStatus,
};

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

  const loadPlayers = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const { data, error: loadError } = await supabase.from("players")
        .select("id,name,full_name,sex,positions,birth_date,birth_country,birth_locality,nationality,second_nationality,dominant_foot,preferred_number,practice_years,previous_club,other_sports,abdominal_perimeter,photo_path,status")
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

  const openNew = () => { setEditingId(null); setForm(emptyForm); setFormError(""); setShowForm(true); };
  const openEdit = (player: Player) => {
    setEditingId(player.id);
    setForm({
      name: player.name, full_name: player.full_name, sex: player.sex, positions: player.positions ?? [],
      birth_date: player.birth_date, birth_country: player.birth_country ?? "", birth_locality: player.birth_locality ?? "",
      nationality: player.nationality, second_nationality: player.second_nationality ?? "",
      dominant_foot: player.dominant_foot, preferred_number: player.preferred_number?.toString() ?? "",
      practice_years: player.practice_years?.toString() ?? "", previous_club: player.previous_club ?? "",
      other_sports: player.other_sports ?? "", abdominal_perimeter: player.abdominal_perimeter?.toString() ?? "",
      status: player.status,
    });
    setFormError(""); setShowForm(true);
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
      };
      const result = editingId
        ? await supabase.from("players").update(payload).eq("id", editingId)
        : await supabase.from("players").insert(payload);
      if (result.error) throw result.error;
      await loadPlayers(); setShowForm(false); setSelected(null);
    } catch (saveError) {
      console.error("Erro ao guardar jogadora:", saveError);
      setFormError("Não foi possível guardar a ficha. Verifica os dados e as permissões do Treinador Principal.");
    } finally { setSaving(false); }
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
          <div className="staff-actions roster-actions"><button onClick={() => setSelected(player)}>Consultar</button>{canManage && <button onClick={() => openEdit(player)}>Editar</button>}</div>
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
          <div className="roster-form-section"><h3>Características desportivas</h3><div className="form-grid">
            <label><span>Pé dominante *</span><select value={form.dominant_foot} onChange={e => setForm({...form,dominant_foot:e.target.value})}><option>Direito</option><option>Esquerdo</option><option>Ambidestro</option></select></label>
            <label><span>Número preferido (1–99)</span><input type="number" min="1" max="99" value={form.preferred_number} onChange={e => setForm({...form,preferred_number:e.target.value})}/></label>
            <label><span>Anos de prática</span><input type="number" min="0" max="80" value={form.practice_years} onChange={e => setForm({...form,practice_years:e.target.value})}/></label>
            <label><span>Clube anterior</span><input value={form.previous_club} onChange={e => setForm({...form,previous_club:e.target.value})}/><small>A associação à lista central de clubes será ligada no módulo Clubes.</small></label>
            <label><span>Outros desportos/atividades</span><input value={form.other_sports} onChange={e => setForm({...form,other_sports:e.target.value})}/></label>
            <label><span>Perímetro abdominal (cm)</span><input type="number" min="0.1" max="300" step="0.1" value={form.abdominal_perimeter} onChange={e => setForm({...form,abdominal_perimeter:e.target.value})}/></label>
          </div><fieldset className="role-picker"><legend>Posições *</legend><div>{positions.map(position => <label key={position}><input type="checkbox" checked={form.positions.includes(position)} onChange={() => togglePosition(position)}/>{position}</label>)}</div><small>Universal é uma posição exclusiva e não pode ser combinada com outras.</small></fieldset></div>
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
          <div><span>Posições</span><strong>{selected.positions.join(" / ")}</strong></div><div><span>Pé dominante</span><strong>{selected.dominant_foot}</strong></div>
          <div><span>Número preferido</span><strong>{selected.preferred_number ?? "—"}</strong></div><div><span>Anos de prática</span><strong>{selected.practice_years ?? "—"}</strong></div>
          <div><span>Clube anterior</span><strong>{selected.previous_club || "—"}</strong></div><div><span>Outros desportos/atividades</span><strong>{selected.other_sports || "—"}</strong></div>
          <div><span>Perímetro abdominal</span><strong>{selected.abdominal_perimeter == null ? "—" : `${selected.abdominal_perimeter} cm`}</strong></div>
          <div><span>Estado</span><strong>{statusLabels[selected.status]}</strong></div>
        </div>
        <div className="modal-actions">{canManage && <button className="danger-button" onClick={() => void archive(selected)}>Arquivar ficha</button>}<button className="secondary-button" onClick={() => setSelected(null)}>Fechar</button></div>
      </section>
    </div>}
  </main>;
}

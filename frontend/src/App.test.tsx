import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const { mockProfile, mockStaffOrder, mockStaffInsert, mockRoleInsert, mockStaffUpdate, mockFunctionInvoke } = vi.hoisted(() => ({
  mockProfile: { role: "administrador_principal", status: "ativo" },
  mockStaffOrder: vi.fn().mockResolvedValue({ data: [], error: null }),
  mockStaffInsert: vi.fn().mockResolvedValue({ data: { id: "staff-123" }, error: null }),
  mockRoleInsert: vi.fn().mockResolvedValue({ error: null }),
  mockStaffUpdate: vi.fn().mockResolvedValue({ error: null }),
  mockFunctionInvoke: vi.fn(async (name: string) => {
    if (name === "accept-staff-invite") mockProfile.status = "ativo";
    return { data: { message: "Operação concluída." }, error: null };
  }),
}));

vi.mock("./lib/supabase", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  display_name: "Administrador de Teste",
                  role: mockProfile.role,
                  status: mockProfile.status,
                },
                error: null,
              }),
            })),
          })),
        };
      }
      if (table === "staff_members") {
        return {
          select: vi.fn(() => ({ order: mockStaffOrder })),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: mockStaffInsert,
            })),
          })),
          update: vi.fn(() => ({ eq: mockStaffUpdate })),
        };
      }
      return {
        insert: mockRoleInsert,
        delete: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn().mockResolvedValue({ error: null }),
          })),
        })),
      };
    }),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "test-user" } } }, error: null }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signInWithPassword: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn().mockResolvedValue({ data: { user: { id: "test-user" } }, error: null }),
      signOut: vi.fn(),
    },
    functions: {
      invoke: mockFunctionInvoke,
    },
  },
  testSupabaseConnection: vi.fn().mockResolvedValue(true),
}));

import App from "./App";
import { supabase } from "./lib/supabase";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
  vi.clearAllMocks();
  mockProfile.role = "administrador_principal";
  mockProfile.status = "ativo";
  mockStaffOrder.mockResolvedValue({ data: [], error: null });
  mockStaffInsert.mockResolvedValue({ data: { id: "staff-123" }, error: null });
  mockRoleInsert.mockResolvedValue({ error: null });
  mockStaffUpdate.mockResolvedValue({ error: null });
  mockFunctionInvoke.mockImplementation(async (name: string) => {
    if (name === "accept-staff-invite") mockProfile.status = "ativo";
    return { data: { message: "Operação concluída." }, error: null };
  });
});

describe("plataforma de futsal", () => {
  it("apresenta o centro de controlo e as áreas planeadas", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Centro de controlo" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Áreas do projeto" })).toBeInTheDocument();
    expect(screen.getAllByText("Biblioteca de vídeos")).toHaveLength(2);
  });

  it("apresenta a opção para terminar uma sessão autenticada", async () => {
    render(<App />);
    expect(await screen.findByRole("button", { name: "Terminar sessão" })).toBeInTheDocument();
  });

  it("abre a área Staff e carrega a lista persistida", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Centro de controlo" });
    fireEvent.click(screen.getByRole("button", { name: /Staff/ }));
    expect(await screen.findByText("Não foram encontrados elementos.")).toBeInTheDocument();
    expect(supabase.from).toHaveBeenCalledWith("staff_members");
  });

  it("guarda um novo elemento e as respetivas funções no Supabase", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Centro de controlo" });
    fireEvent.click(screen.getByRole("button", { name: /Staff/ }));
    await screen.findByText("Não foram encontrados elementos.");
    fireEvent.click(screen.getByRole("button", { name: /Adicionar elemento/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Treinador Adjunto")).not.toBeChecked();
    expect(within(dialog).getByLabelText("Treinador Principal")).not.toBeChecked();
    fireEvent.change(within(dialog).getByLabelText("Nome apresentado *"), { target: { value: "Nova treinadora" } });
    fireEvent.change(within(dialog).getByLabelText("Email de convite *"), { target: { value: "nova@exemplo.pt" } });
    fireEvent.click(within(dialog).getByLabelText("Treinador Principal"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar elemento" }));
    await waitForDialogToClose();
    expect(mockStaffInsert).toHaveBeenCalled();
    expect(mockRoleInsert).toHaveBeenCalledWith([
      { staff_member_id: "staff-123", role_name: "Treinador Principal" },
    ]);
  });

  it("envia um convite a um elemento de Staff pendente", async () => {
    mockStaffOrder.mockResolvedValueOnce({
      data: [{
        id: "staff-invite-1",
        name: "Nova treinadora",
        full_name: "Nova treinadora",
        email: "nova@exemplo.pt",
        birth_date: null,
        status: "pendente",
        created_at: "2026-11-26T10:00:00Z",
        staff_member_roles: [{ role_name: "Treinador Principal" }],
      }],
      error: null,
    });
    render(<App />);
    await screen.findByRole("heading", { name: "Centro de controlo" });
    fireEvent.click(screen.getByRole("button", { name: /Staff/ }));
    expect(await screen.findByText("Nova treinadora")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enviar convite" }));
    await waitFor(() => expect(mockFunctionInvoke).toHaveBeenCalledWith("invite-staff", {
      body: { staffMemberId: "staff-invite-1" },
    }));
  });

  it("permite ao Treinador Principal gerir o Staff", async () => {
    mockProfile.role = "treinador_principal";
    render(<App />);
    await screen.findByRole("heading", { name: "Centro de controlo" });
    fireEvent.click(screen.getByRole("button", { name: /Staff/ }));
    expect(await screen.findByRole("button", { name: /Adicionar elemento/ })).toBeInTheDocument();
  });

  it("não permite ao Staff gerir elementos do Staff", async () => {
    mockProfile.role = "staff";
    render(<App />);
    await screen.findByRole("heading", { name: "Centro de controlo" });
    fireEvent.click(screen.getByRole("button", { name: /Staff/ }));
    expect(screen.queryByRole("button", { name: /Adicionar elemento/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.getByText(/Apenas o Administrador Principal e o Treinador Principal/)).toBeInTheDocument();
  });

  it("impede registar um email que já existe na base de dados", async () => {
    mockStaffOrder.mockResolvedValueOnce({
      data: [{
        id: "existing-1",
        name: "Treinador existente",
        full_name: "Treinador existente",
        email: "treinador@exemplo.pt",
        birth_date: null,
        status: "ativo",
        created_at: "2026-11-25T10:00:00Z",
        staff_member_roles: [{ role_name: "Treinador Principal" }],
      }],
      error: null,
    });
    render(<App />);
    await screen.findByRole("heading", { name: "Centro de controlo" });
    fireEvent.click(screen.getByRole("button", { name: /Staff/ }));
    expect(await screen.findByText("Treinador existente")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Adicionar elemento/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Nome apresentado *"), { target: { value: "Duplicado" } });
    fireEvent.change(within(dialog).getByLabelText("Email de convite *"), { target: { value: "treinador@exemplo.pt" } });
    fireEvent.click(within(dialog).getByLabelText("Treinador Principal"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar elemento" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Já existe um registo de Staff com este email.");
  });
});

async function waitForDialogToClose() {
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
}

describe("definição de palavra-passe", () => {
  it("apresenta o formulário quando a pessoa abre um convite", async () => {
    window.history.replaceState(null, document.title, "/#access_token=test&type=invite");
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Definir palavra-passe" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nova palavra-passe")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirmar palavra-passe")).toBeInTheDocument();
  });

  it("ativa o perfil Staff depois de definir a palavra-passe do convite", async () => {
    mockProfile.role = "staff";
    mockProfile.status = "convite_pendente";
    window.history.replaceState(null, document.title, "/#access_token=test&type=invite");
    render(<App />);
    await screen.findByRole("heading", { name: "Definir palavra-passe" });
    fireEvent.change(screen.getByLabelText("Nova palavra-passe"), { target: { value: "FutsalSeguro2026!" } });
    fireEvent.change(screen.getByLabelText("Confirmar palavra-passe"), { target: { value: "FutsalSeguro2026!" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar palavra-passe" }));
    await waitFor(() => expect(mockFunctionInvoke).toHaveBeenCalledWith("accept-staff-invite", { body: {} }));
    expect(await screen.findByRole("heading", { name: "Centro de controlo" })).toBeInTheDocument();
  });

  it("rejeita uma palavra-passe que não cumpre os requisitos", async () => {
    window.history.replaceState(null, document.title, "/#access_token=test&type=invite");
    render(<App />);
    await screen.findByRole("heading", { name: "Definir palavra-passe" });
    fireEvent.change(screen.getByLabelText("Nova palavra-passe"), { target: { value: "palavrapasse" } });
    fireEvent.change(screen.getByLabelText("Confirmar palavra-passe"), { target: { value: "palavrapasse" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar palavra-passe" }));
    expect(screen.getByRole("alert")).toHaveTextContent("A palavra-passe deve ter pelo menos 12 caracteres");
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it("guarda a palavra-passe e encaminha para a plataforma", async () => {
    window.history.replaceState(null, document.title, "/#access_token=test&type=invite");
    render(<App />);
    await screen.findByRole("heading", { name: "Definir palavra-passe" });
    fireEvent.change(screen.getByLabelText("Nova palavra-passe"), { target: { value: "FutsalSeguro2026!" } });
    fireEvent.change(screen.getByLabelText("Confirmar palavra-passe"), { target: { value: "FutsalSeguro2026!" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar palavra-passe" }));
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: "FutsalSeguro2026!" });
    expect(await screen.findByRole("heading", { name: "Centro de controlo" })).toBeInTheDocument();
  });
});

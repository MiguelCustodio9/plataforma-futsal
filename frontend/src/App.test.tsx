import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
vi.mock("./lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: {
              display_name: "Administrador de Teste",
              role: "administrador_principal",
              status: "ativo",
            },
            error: null,
          }),
        })),
      })),
    })),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "test-user" } } }, error: null }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signInWithPassword: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn().mockResolvedValue({ data: { user: { id: "test-user" } }, error: null }),
      signOut: vi.fn(),
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

  it("abre a área Staff e apresenta os registos", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Centro de controlo" });
    fireEvent.click(screen.getByRole("button", { name: /Staff/ }));
    expect(screen.getByRole("heading", { name: "Gestão de Staff" })).toBeInTheDocument();
    expect(screen.getByText("Exemplo de treinador")).toBeInTheDocument();
    expect(
      screen.getByText("Convite pendente", {
      selector: "span.status-pill",
    })
).toBeInTheDocument();
  });

  it("permite adicionar um elemento de Staff em modo de demonstração", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Centro de controlo" });
    fireEvent.click(screen.getByRole("button", { name: /Staff/ }));
    fireEvent.click(screen.getByRole("button", { name: /Adicionar elemento/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Nome apresentado *"), { target: { value: "Nova treinadora" } });
    fireEvent.change(within(dialog).getByLabelText("Email de convite *"), { target: { value: "nova@exemplo.pt" } });
    fireEvent.click(within(dialog).getByLabelText("Treinador Principal"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar elemento" }));
    expect(screen.getByText("Nova treinadora")).toBeInTheDocument();
    expect(screen.getByText("nova@exemplo.pt")).toBeInTheDocument();
  });

  it("impede registar o mesmo email duas vezes", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Centro de controlo" });
    fireEvent.click(screen.getByRole("button", { name: /Staff/ }));
    fireEvent.click(screen.getByRole("button", { name: /Adicionar elemento/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Nome apresentado *"), { target: { value: "Duplicado" } });
    fireEvent.change(within(dialog).getByLabelText("Email de convite *"), { target: { value: "treinador@exemplo.pt" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar elemento" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Já existe um registo de Staff com este email.");
  });
});


describe("definição de palavra-passe", () => {
  it("apresenta o formulário quando a pessoa abre um convite", async () => {
    window.history.replaceState(null, document.title, "/#access_token=test&type=invite");
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Definir palavra-passe" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nova palavra-passe")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirmar palavra-passe")).toBeInTheDocument();
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

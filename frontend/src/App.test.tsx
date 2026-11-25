import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import App from "./App";

afterEach(() => {
  cleanup();
});

describe("plataforma de futsal", () => {
  it("apresenta o centro de controlo e as áreas planeadas", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Centro de controlo" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Áreas do projeto" })).toBeInTheDocument();
    expect(screen.getAllByText("Biblioteca de vídeos")).toHaveLength(2);
  });

  it("identifica que a aplicação ainda não tem sessão iniciada", () => {
    render(<App />);
    expect(screen.getByLabelText("Sem sessão iniciada")).toBeInTheDocument();
  });

  it("abre a área Staff e apresenta os registos", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /Staff/ }));
    expect(screen.getByRole("heading", { name: "Gestão de Staff" })).toBeInTheDocument();
    expect(screen.getByText("Exemplo de treinador")).toBeInTheDocument();
    expect(screen.getByText("Convite pendente")).toBeInTheDocument();
  });

  it("permite adicionar um elemento de Staff em modo de demonstração", () => {
    render(<App />);
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

  it("impede registar o mesmo email duas vezes", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /Staff/ }));
    fireEvent.click(screen.getByRole("button", { name: /Adicionar elemento/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Nome apresentado *"), { target: { value: "Duplicado" } });
    fireEvent.change(within(dialog).getByLabelText("Email de convite *"), { target: { value: "treinador@exemplo.pt" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar elemento" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Já existe um registo de Staff com este email.");
  });
});

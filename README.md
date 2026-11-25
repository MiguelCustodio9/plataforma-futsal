# Plataforma de Futsal

Plataforma privada de gestão e análise de futsal.

## Estrutura

- `frontend/`: aplicação web React + TypeScript + Vite.
- `backend/`: documentação e futuras migrações/configuração do Supabase.
- `docs/`: arquitetura, decisões técnicas e especificações.

## Requisitos locais

- Node.js 20.19+ ou 22.12+
- npm 10+

## Desenvolvimento

```bash
cd frontend
npm install
npm run dev
```

## Qualidade

```bash
npm run lint
npm run test
npm run build
```

## Segurança

Nunca guardar credenciais, chaves privadas ou ficheiros `.env` no Git. O frontend nunca deve receber a chave `service_role` do Supabase. As permissões e políticas RLS serão implementadas e testadas antes de ligar dados reais.

## Estado

Fundação inicial do projeto. A autenticação, a base de dados e os módulos funcionais serão implementados por etapas, com testes e validação antes de cada avanço.

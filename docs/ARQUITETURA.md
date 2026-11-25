# Arquitetura inicial

## Objetivo

Construir uma plataforma privada para uma equipa ativa de futsal de cada vez, mantendo o histórico de épocas, clubes, equipas adversárias e competições.

## Tecnologias

- Frontend: React, TypeScript, Vite e Tailwind CSS.
- Backend previsto: Supabase (PostgreSQL, Auth, Storage e Edge Functions), condicionado à validação dos limites gratuitos e custos.
- Publicação inicial prevista: GitHub Pages para o frontend.
- Aplicação instalável: PWA.

## Organização

- `frontend/`: interface e lógica de apresentação.
- `backend/`: migrações SQL, políticas RLS, funções e documentação de configuração.
- `docs/`: arquitetura, decisões e planos de testes.

## Princípios obrigatórios

1. Privacidade por defeito; sem páginas públicas nem registo público.
2. Menor privilégio e validação de permissões no servidor.
3. RLS em todas as tabelas expostas ao cliente.
4. Nunca incluir segredos de servidor no frontend ou no Git.
5. Não ativar serviços pagos, faturação automática ou upgrades sem autorização expressa.
6. Implementar módulo a módulo, com testes automáticos e revisão de segurança.
7. Preservar histórico e auditoria sem alterar retroativamente jogos/épocas encerrados.
8. Interface responsiva, acessível e preparada para PT-PT, inglês e espanhol.

## Fases técnicas

1. Fundação frontend e qualidade.
2. Modelo de dados, autenticação e autorização.
3. Configuração inicial e gestão de utilizadores.
4. Módulos funcionais pela ordem validada no projeto.
5. PWA, sincronização e funcionalidades offline.
6. Testes integrados, revisão de segurança e publicação.

## Estado atual

Apenas a fundação do frontend está a ser inicializada. Não existe ainda ligação a um projeto Supabase nem autenticação funcional.

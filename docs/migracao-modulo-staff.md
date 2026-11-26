# Módulo 01 — Staff: migração e validação

## Estado

A migration `supabase/migrations/20261126120000_staff_module_and_rls.sql` foi criada no GitHub. Ainda não deve ser considerada aplicada no Supabase até a execução manual e validação descritas abaixo.

A migration inicial de perfis e bootstrap do Administrador Principal já foi aplicada anteriormente. **Não a voltar a executar e não executar `supabase db push`.**

## Modelo criado

- `staff_members`: ficha do elemento, ligação opcional ao perfil Auth, nome, nome completo, email, nascimento, caminho da fotografia, estado do convite/acesso e datas de auditoria.
- `staff_member_roles`: funções permanentes, com várias funções permitidas por elemento.
- Estados: `pendente`, `convite_enviado`, `ativo`, `suspenso`, `convite_expirado`, `arquivado`.
- Funções: Treinador Principal, Treinador Estagiário, Treinador Adjunto, Treinador de GR, Delegado, Presidente, Diretor, Fisioterapeuta, Massagista, Enfermeira e Estagiário.

## Permissões

- Qualquer utilizador autenticado com perfil ativo pode consultar a lista e as funções do Staff.
- Só Administrador Principal e Treinador Principal ativos podem inserir/editar fichas e gerir funções.
- A ligação ao perfil Auth e os campos de auditoria não podem ser alterados pelo cliente.
- Não existe política de eliminação de fichas. A remoção funcional deverá ser feita por arquivo, preservando o histórico.
- A função `current_user_can_manage_staff()` verifica o papel diretamente em `profiles`; não confia em metadados enviados pelo browser.

## Aplicar no Supabase

1. Abrir o projeto Supabase da Plataforma Futsal e entrar no SQL Editor.
2. Abrir no GitHub o ficheiro `supabase/migrations/20261126120000_staff_module_and_rls.sql`.
3. Copiar o conteúdo integral e executar uma única vez no SQL Editor.
4. Confirmar que a execução terminou sem erros.
5. Não executar novamente a migration inicial nem usar `supabase db push`.

A migration é idempotente para os objetos que cria, mas isso não substitui a validação da primeira execução.

## Verificações SQL após aplicação

Executar no SQL Editor:

```sql
select
  to_regclass('public.staff_members') as staff_members,
  to_regclass('public.staff_member_roles') as staff_member_roles,
  to_regprocedure('public.current_user_can_manage_staff()') as permission_function;

select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('staff_members', 'staff_member_roles');

select schemaname, tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in ('staff_members', 'staff_member_roles')
order by tablename, policyname;
```

O primeiro resultado deve mostrar as duas tabelas e a função; o segundo deve indicar `rowsecurity = true` para ambas. O terceiro deve listar as políticas de leitura e gestão.

## Testes de autorização a executar na aplicação

Depois de existir a integração de frontend e de convites:

1. Administrador Principal: consegue consultar, criar, editar, suspender/reativar e arquivar.
2. Treinador Principal: consegue executar as mesmas operações.
3. Staff: consegue consultar a lista, mas não consegue inserir/editar fichas nem gerir funções.
4. Jogadora: consegue consultar a lista, mas não consegue inserir/editar fichas nem gerir funções.
5. Utilizador sem sessão ou com perfil suspenso: não consegue consultar os registos.
6. Tentativa de alterar `profile_id`, `created_by` ou `updated_by` através do cliente: deve ser recusada.

A execução desta migration cria apenas a estrutura e as políticas. O envio de convites, a criação de contas Auth e a sincronização do estado de acesso serão ligados numa etapa separada através de uma Edge Function segura, sem expor a chave `service_role` no frontend.

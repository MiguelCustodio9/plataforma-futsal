# Configuração e ativação do primeiro Administrador Principal

## Estado atual

A preparação está versionada no GitHub, mas **nenhuma migration foi aplicada nesta execução, nenhuma Edge Function foi publicada e nenhum utilizador foi criado**. O segredo temporário e a chave `service_role` não foram adicionados ao repositório nem ao frontend.

A função `bootstrap-first-admin` reserva atomicamente o bootstrap antes de enviar o convite. A reserva expira após 15 minutos e é libertada quando a criação do convite ou do perfil falha. Depois de concluído, o registo fica consumido e não aceita uma segunda utilização.

## Pré-requisitos antes da ativação

1. Confirmar no Dashboard que o projeto aberto é o projeto da plataforma.
2. Rever **todas** as migrations pendentes em `supabase/migrations/`, pela ordem dos timestamps. `supabase db push` aplica todas as migrations pendentes, não apenas a primeira.
3. Confirmar que o endereço de redirecionamento do convite está autorizado em Authentication → URL Configuration. O endereço de produção já foi indicado na configuração anterior, mas o estado atual do Dashboard não pode ser verificado pelo repositório.
4. Confirmar nas definições de Auth que não existe registo público de utilizadores. A aplicação não disponibiliza `signUp`; as contas devem ser criadas apenas por convites administrativos.
5. Confirmar os secrets necessários na Edge Function, sem os partilhar na conversa.
6. Confirmar que os workflows de frontend e validação Supabase estão verdes para o commit que se pretende utilizar.

## Secrets da Edge Function

Configurar em Supabase Dashboard → Edge Functions → Secrets:

- `BOOTSTRAP_SECRET`: valor aleatório com pelo menos 32 caracteres, temporário e de utilização única.
- `BOOTSTRAP_ALLOWED_ORIGIN`: origem exata do GitHub Pages, sem caminho.
- `BOOTSTRAP_REDIRECT_URL`: URL final do site, autorizado nas definições de Auth.
- `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`: valores de servidor do projeto, exclusivamente no ambiente servidor.

Nunca colocar estes valores em `VITE_*`, no frontend, em ficheiros versionados, em logs ou em mensagens. A `service_role` não pode ser exposta no GitHub Pages.

## Configuração e sequência de ativação

1. Associar a Supabase CLI ao projeto correto, confirmando o project ref antes de qualquer operação.
2. Rever as migrations em conjunto. A cadeia atual inclui perfis/papéis, bootstrap inicial, Staff, ciclo de vida de contas e auditoria de acessos. Não aplicar apenas a primeira migration se a intenção for preparar todo o backend atual.
3. Aplicar as migrations aprovadas com `supabase db push`. Não executar este comando até a revisão e a confirmação do projeto estarem concluídas.
4. Configurar os secrets da Edge Function.
5. Publicar `bootstrap-first-admin` com a Supabase CLI. A configuração versionada define `verify_jwt = false` para esta função porque a autenticação é feita pelo segredo temporário `x-bootstrap-secret`, validado dentro da função. Não remover essa validação.
6. Enviar o POST diretamente a partir de um terminal de confiança, com o header `x-bootstrap-secret` e apenas o nome/email pretendidos. O frontend público não chama esta função.
7. Abrir o convite recebido e definir a palavra-passe no ecrã da plataforma.
8. Confirmar no Supabase que o perfil tem o papel `administrador_principal` e estado `ativo`, e que o bootstrap ficou consumido.
9. Remover imediatamente `BOOTSTRAP_SECRET` dos secrets do projeto.

O workflow `Publicar funções Supabase` é manual (`workflow_dispatch`) e agora inclui a função de bootstrap. Não foi executado nesta preparação.

## Distinção entre convites

Os convites iniciais do Administrador incluem o metadado `invite_kind=initial_admin`; por isso, a definição de palavra-passe não chama a função de ativação de Staff. Os convites de Staff e Treinador Principal incluem `invite_kind=staff`. Convites antigos sem esse metadado continuam a ser tratados como convites de Staff.

## Limites e validações pendentes

- O workflow de frontend executa testes Vitest, lint e build.
- O workflow Supabase executa `deno check` nas Edge Functions. Não executa migrations SQL nem testes de integração RLS.
- A migration SQL e as políticas RLS ainda precisam de validação numa instância Supabase de teste antes de serem aplicadas ao projeto real.
- O estado das migrations aplicadas, dos secrets, da opção de signup e dos utilizadores existentes só pode ser confirmado no Supabase Dashboard/CLI autenticada; não é inferível a partir do GitHub.
- Se o convite for enviado mas a criação do perfil falhar, a função tenta eliminar o utilizador Auth e libertar a reserva. Uma falha externa pode exigir verificação manual antes de repetir a operação.

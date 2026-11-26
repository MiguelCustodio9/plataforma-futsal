# Configuração e ativação do primeiro Administrador Principal

## Estado

Os ficheiros de migration e Edge Function estão preparados, mas **não foram aplicados nem publicados**. Não foi criado qualquer utilizador e nenhuma chave foi adicionada ao GitHub.

## Pré-requisitos antes da ativação

1. Confirmar no Dashboard que este é o projeto Supabase correto.
2. Rever a migration `supabase/migrations/20261126090000_profiles_roles_and_initial_admin.sql`.
3. Confirmar que o fluxo de convite e definição de palavra-passe continua coberto pelos testes do frontend e que o workflow de validação está verde.
4. Confirmar o URL permitido de redirecionamento de autenticação no Supabase.
5. Instalar e autenticar a Supabase CLI localmente. Não guardar o access token da CLI no repositório.

## Secrets da Edge Function

Configurar no Supabase Dashboard, em Edge Functions → Secrets, sem os colocar no frontend nem em ficheiros versionados:

- `BOOTSTRAP_SECRET`: valor aleatório com pelo menos 32 caracteres, de utilização temporária.
- `BOOTSTRAP_ALLOWED_ORIGIN`: origem exata do site publicado, por exemplo `https://miguelcustodio9.github.io` (sem caminho).
- `BOOTSTRAP_REDIRECT_URL`: URL final para onde o convite deve regressar; tem de estar autorizado nas definições de Auth.
- `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`: usar os valores de servidor do projeto. A service role nunca pode ser exposta em `VITE_*`, código cliente ou GitHub Pages.

Não partilhar estes valores em mensagens, screenshots ou commits.

## Sequência de ativação — ainda não executar

Depois de todos os pré-requisitos e testes aprovados:

1. Associar a Supabase CLI ao projeto correto.
2. Aplicar a migration revista com `supabase db push`.
3. Publicar a função com `supabase functions deploy bootstrap-first-admin`.
4. Enviar um pedido POST diretamente à função, a partir de um terminal de confiança, com o header `x-bootstrap-secret` e apenas o email/nome pretendidos. Não chamar a função a partir do frontend público.
5. Confirmar que o convite foi recebido e concluir a definição de palavra-passe no ecrã próprio.
6. Confirmar a existência do perfil com papel `administrador_principal`.
7. Remover imediatamente `BOOTSTRAP_SECRET` dos secrets do projeto. A base de dados também marca o bootstrap como consumido, bloqueando novas tentativas.

A função exige o segredo temporário e a RPC serializa as chamadas concorrentes. O papel de administrador não é aceite no corpo do pedido; é atribuído exclusivamente pela função SQL executável pela service role.

## Limites conhecidos

- O ecrã de definição de palavra-passe está implementado no frontend e contempla convites e recuperação. A validação real do fluxo depende ainda de um convite de teste, depois da configuração dos redirecionamentos e da publicação controlada da função.
- As políticas RLS atuais permitem ao utilizador ler o próprio perfil e ao Administrador Principal ler os perfis. Não permitem ao cliente inserir perfis nem alterar papéis/estados.
- O acesso transversal de Treinador Principal e Staff deve ser definido por módulo antes de acrescentar políticas adicionais.
- Esta documentação não substitui a revisão da migration nem a validação no projeto Supabase real.

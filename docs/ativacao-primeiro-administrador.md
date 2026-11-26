# Configuração e ativação do primeiro Administrador Principal

## Estado

A migration e a Edge Function estão preparadas no GitHub, mas **não foram aplicadas nem publicadas**. Não foi criado qualquer utilizador e nenhuma chave foi adicionada ao GitHub.

A Edge Function reserva atomicamente o bootstrap na base de dados antes de enviar o convite. A reserva expira após 15 minutos se a operação não for concluída, e é libertada quando o convite ou a criação do perfil falha.

## Pré-requisitos antes da ativação

1. Confirmar no Dashboard que este é o projeto Supabase correto.
2. Rever a migration `supabase/migrations/20261126090000_profiles_roles_and_initial_admin.sql`.
3. Confirmar que os workflows de frontend e validação Supabase estão verdes.
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

A função exige o segredo temporário, valida a origem quando existe um cabeçalho Origin e reserva o bootstrap antes de enviar o convite. As funções SQL de reserva, conclusão e libertação só podem ser executadas pela service role.

## Limites conhecidos

- O ecrã de definição de palavra-passe está implementado no frontend e contempla convites e recuperação. A validação real do fluxo depende ainda de um convite depois da configuração e publicação controlada da função.
- As políticas RLS atuais permitem ao utilizador ler o próprio perfil e ao Administrador Principal ler os perfis. Não permitem ao cliente inserir perfis nem alterar papéis/estados.
- O acesso transversal de Treinador Principal e Staff deve ser definido por módulo antes de acrescentar políticas adicionais.
- A CI verifica a sintaxe TypeScript da Edge Function, mas não executa a migration SQL nem valida RLS numa instância Supabase. A migration deve ser revista e validada cuidadosamente antes de ser aplicada na base de dados real.
- Se a criação do perfil falhar depois de enviado o convite, a função tenta eliminar a conta Auth criada e libertar a reserva. Uma falha de rede ou indisponibilidade externa pode exigir verificação manual antes de repetir o procedimento.

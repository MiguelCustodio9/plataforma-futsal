# Auditoria de segurança — primeiro Administrador Principal

**Estado revisto em 27-11-2026, branch `main`.**

## Implementação encontrada

- O frontend usa `@supabase/supabase-js` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. A chave privilegiada não é necessária no browser.
- O `AuthGate` verifica a sessão, permite login por email/palavra-passe, recuperação de palavra-passe, definição de palavra-passe por convite/recuperação e terminar sessão.
- Não existe fluxo de `signUp` público na aplicação.
- A palavra-passe definida no frontend exige pelo menos 12 caracteres, maiúscula, minúscula, número e símbolo. A política de passwords comuns/comprometidas continua a precisar de configuração/validação adicional no Auth.
- Existem migrations para `profiles`, papéis/estados, Staff, ciclo de vida de contas e auditoria de acessos.
- `profiles` tem RLS ativa. O utilizador autenticado pode ler o próprio perfil; o Administrador Principal ativo pode ler os perfis. O cliente só pode alterar o próprio `display_name`, não o papel nem o estado.
- As funções SQL de reserva/conclusão/libertação do bootstrap são `SECURITY DEFINER`, usam `search_path` vazio e têm execução limitada à `service_role`.
- A Edge Function `bootstrap-first-admin` exige um segredo temporário com comparação em tempo constante, valida a origem quando existe o cabeçalho Origin, reserva o bootstrap antes do convite e só depois cria o perfil de Administrador Principal.
- A configuração Supabase versionada define `verify_jwt = false` para `bootstrap-first-admin`; a função valida o seu próprio segredo `x-bootstrap-secret`. A publicação continua manual.
- Os convites usam o metadado `invite_kind` para distinguir a ativação inicial do Administrador da ativação de Staff. O frontend mantém compatibilidade com convites Staff antigos sem esse metadado.
- O workflow manual de publicação Supabase inclui agora `bootstrap-first-admin`.

## Modelo e controlos do bootstrap

1. O primeiro utilizador é criado por convite administrativo no servidor, nunca por formulário público.
2. O papel `administrador_principal` é atribuído pela função SQL; não é aceite do browser.
3. A tabela singleton `initial_admin_bootstrap` guarda reserva, token e data de consumo.
4. Um advisory lock e um lock da linha impedem reservas concorrentes.
5. A reserva expira após 15 minutos.
6. A criação do perfil e o consumo do bootstrap ocorrem na mesma transação SQL.
7. A chave `service_role` só é lida por código servidor e não deve aparecer em `VITE_*`, no frontend ou em commits.
8. Depois do sucesso, o segredo temporário deve ser removido manualmente dos secrets.

## Testes existentes e lacunas

- `frontend/src/App.test.tsx` cobre permissões visuais por papel, gestão de acessos, convites de Staff/Treinador Principal, definição de palavra-passe, recuperação e agora a distinção do convite inicial do Administrador.
- `frontend/src/lib/supabase.test.ts` verifica a criação do cliente Supabase.
- `validate-supabase.yml` executa `deno check` em todas as Edge Functions.
- Não existem ainda testes de integração que executem as migrations SQL, simulem utilizadores anónimos/autenticados contra RLS ou tentem repetir o bootstrap em concorrência.
- Os testes frontend usam mocks; não provam o comportamento do projeto Supabase real.

## Estado real do projeto Supabase

O repositório não permite confirmar se as migrations já foram aplicadas, se as Edge Functions estão publicadas, se os secrets estão configurados, se o signup está desativado ou se existem utilizadores/perfis na base de dados. Esses pontos têm de ser confirmados no Dashboard ou através da CLI autenticada, sem partilhar credenciais.

**Nesta preparação não foi executada nenhuma migration, não foi publicada nenhuma função, não foi criado ou eliminado qualquer utilizador e não foram alterados dados reais.**

## Próximos passos seguros

1. Confirmar no Dashboard o projeto e a configuração Auth.
2. Rever a cadeia completa de migrations e validar SQL/RLS numa base de dados de teste.
3. Só depois aplicar migrations aprovadas ao projeto correto.
4. Configurar secrets temporários no Supabase e publicar a função.
5. Executar o convite a partir de um terminal de confiança, verificar o perfil e remover o segredo temporário.

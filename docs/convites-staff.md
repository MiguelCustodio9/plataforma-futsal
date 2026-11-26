# Convites de acesso ao Staff

## Funcionamento

1. Apenas o Administrador Principal e o Treinador Principal podem enviar ou reenviar convites.
2. O convite é enviado para o email guardado no registo do Staff.
3. A conta é criada com o papel `staff` e fica em estado `convite_pendente`.
4. A pessoa abre a ligação recebida e define uma palavra-passe com pelo menos 12 caracteres, incluindo maiúscula, minúscula, número e símbolo.
5. A função autenticada `accept-staff-invite` confirma que o email da sessão corresponde ao registo e ativa o perfil e o elemento de Staff.
6. O acesso só fica disponível depois da ativação concluída.

As funções Edge `invite-staff` e `accept-staff-invite` validam a sessão no servidor. A chave `service_role` nunca é exposta no frontend.

## Configuração necessária no Supabase

Antes de enviar convites reais:

- Configurar um servidor SMTP próprio em **Authentication → SMTP Settings**. O serviço de email predefinido da Supabase tem limitações de envio e não deve ser considerado adequado para convites gerais a todos os elementos.
- Em **Authentication → URL Configuration**, definir o Site URL e permitir o endereço de redirecionamento `https://miguelcustodio9.github.io/plataforma-futsal/`.
- Confirmar que os emails de convite usam o template de convite da Supabase e que a ligação redireciona para a aplicação.
- Manter a verificação JWT ativa nas duas funções.

Não colocar credenciais SMTP, chaves Supabase ou tokens no repositório. As credenciais devem ser configuradas apenas nos controlos seguros do projeto Supabase.

## Publicação das funções

Foi criado o workflow manual **Publicar funções Supabase** no GitHub Actions.

1. Na Supabase, criar um Access Token em **Account → Access Tokens**.
2. No GitHub, abrir **Settings → Secrets and variables → Actions → New repository secret**.
3. Criar o segredo com o nome `SUPABASE_ACCESS_TOKEN` e colar o token. Não o colocar em ficheiros, mensagens ou commits.
4. Abrir o separador **Actions**, escolher **Publicar funções Supabase** e carregar em **Run workflow**.
5. Confirmar que a execução termina com sucesso e que as duas funções aparecem em **Supabase → Edge Functions**.

O workflow publica apenas as funções deste projeto e não executa migrations nem altera a base de dados.

Em alternativa, com a Supabase CLI autenticada localmente e ligada ao projeto correto:

```powershell
npx supabase functions deploy invite-staff --project-ref tuimyjeuykecyxbawwlz
npx supabase functions deploy accept-staff-invite --project-ref tuimyjeuykecyxbawwlz
```

As funções usam as variáveis de ambiente geridas pela plataforma Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. Não criar nem guardar uma cópia destas chaves no frontend.

## Teste de aceitação

- Um Administrador Principal envia um convite para um email de teste.
- O elemento recebe a mensagem e abre a ligação.
- Uma palavra-passe que não cumpra a política é rejeitada.
- Depois de definir uma palavra-passe válida, o perfil e o registo Staff passam a `ativo`.
- A pessoa consegue iniciar sessão.
- Staff e Jogadoras não conseguem invocar a função de envio.
- Um email diferente do email do registo não consegue ativar a conta.
- Um convite repetido não cria uma segunda conta para o mesmo registo.

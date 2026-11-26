# Bootstrap seguro do primeiro Administrador Principal

## Estado auditado em 26-11-2026

- O frontend usa `@supabase/supabase-js` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
- A chave usada no browser é a publishable key; não existe referência a `service_role` no cliente consultado.
- O `AuthGate` verifica a sessão, permite login por email/palavra-passe, recuperação de palavra-passe e terminar sessão.
- Não existe fluxo de criação pública de conta no frontend.
- O painel Staff continua em modo de demonstração, com dados locais temporários; não deve ser tratado como gestão real de utilizadores.
- Não foram encontrados no branch `main` migrations SQL, tabela de perfis/papéis, políticas RLS ou Supabase Edge Functions.
- A configuração do projeto Supabase foi anteriormente feita no Dashboard, mas o estado atual das definições, secrets e utilizadores não pode ser confirmado apenas pelo repositório.

## Decisão de segurança recomendada

A primeira conta não deve ser criada pelo browser nem por um formulário público de signup. O bootstrap deve ser uma operação administrativa, de utilização única, executada no servidor:

1. Criar uma Supabase Edge Function dedicada ao bootstrap inicial.
2. Guardar a chave `service_role` exclusivamente nos secrets da Edge Function/Supabase, nunca em variáveis `VITE_*`, ficheiros versionados ou código do browser.
3. Exigir um segredo de bootstrap forte, aleatório e temporário, configurado fora do repositório. Não o colocar no URL, logs ou resposta da função.
4. Antes de criar a conta, confirmar no servidor que ainda não existe qualquer perfil com o papel `administrador_principal`.
5. Tornar a operação atómica/concorrente-segura no lado da base de dados, para impedir duas primeiras contas em chamadas simultâneas.
6. Criar o utilizador no Supabase Auth e associar-lhe o perfil com o papel `administrador_principal`. Não aceitar o papel enviado pelo cliente.
7. Após sucesso, invalidar/remover o segredo de bootstrap e bloquear novas execuções.
8. Devolver apenas um resultado genérico. Nunca devolver tokens administrativos, chaves ou dados internos.

## Modelo de dados a preparar

Antes de escrever/aplicar migrations, validar e aprovar o modelo:

- `profiles`: `id` igual ao UUID de `auth.users`, nome de apresentação, estado da conta e timestamps.
- Papel atribuído no servidor, com conjunto fechado: `administrador_principal`, `treinador_principal`, `staff`, `jogadora`.
- O papel nunca deve ser aceite como autoridade a partir de metadados editáveis pelo utilizador ou de campos enviados pelo frontend.
- A conta Auth e o respetivo perfil devem manter integridade referencial; a criação de perfil para contas posteriores deve ocorrer por fluxo controlado de convite.

## Princípios RLS obrigatórios

- Ativar RLS em todas as tabelas que contenham dados privados.
- Utilizadores autenticados só podem ler o seu próprio perfil, salvo permissões específicas aprovadas para os papéis.
- Utilizadores não podem promover a sua própria conta nem alterar o seu papel.
- Escrita de papéis e operações de bootstrap ficam reservadas ao servidor/administrador.
- Não confiar em esconder elementos da interface como mecanismo de autorização.
- Criar testes negativos: utilizador anónimo, utilizador comum a tentar ler/alterar perfil alheio, utilizador a tentar mudar o próprio papel e segunda tentativa de bootstrap.

## Bloqueios antes da implementação funcional

- Confirmar no Supabase Dashboard que o projeto correto continua ativo e que a Edge Functions está disponível no plano/configuração atual.
- Preparar os secrets no Supabase, sem os partilhar na conversa nem os guardar no GitHub como variáveis públicas.
- Definir o endereço de email que receberá o convite inicial, sem o incluir em código público.
- Rever e aprovar a migration de perfis/papéis e as políticas RLS antes de as aplicar a qualquer base de dados.

## Critérios de aceitação

- Não existe signup público.
- A primeira conta só pode ser criada enquanto ainda não existir Administrador Principal.
- Duas chamadas simultâneas não conseguem criar dois administradores iniciais.
- A credencial privilegiada só existe no ambiente servidor.
- O segredo de bootstrap deixa de funcionar após a primeira utilização.
- RLS impede escalada de privilégios e acesso a perfis alheios.
- Testes automatizados cobrem o caminho de sucesso e as tentativas proibidas.

> Este documento é uma especificação de implementação. Não cria utilizadores, não altera a base de dados Supabase e não ativa políticas RLS. A implementação deve avançar depois de confirmar a configuração real do projeto e aprovar a migration.

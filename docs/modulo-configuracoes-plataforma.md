# Módulo — Configurações da plataforma

## Objetivo

Disponibilizar ao Administrador Principal um espaço exclusivo para consultar e gerir as configurações globais da plataforma, sem misturar responsabilidades de administração técnica com a gestão desportiva diária.

Este módulo é exclusivo do perfil `administrador_principal`. Treinador Principal, Staff e Jogadoras não podem consultar nem alterar estas configurações.

## Navegação

O ecrã é organizado em seis separadores independentes:

1. Identidade do clube
2. Identidade da equipa
3. Época desportiva
4. Localização e fuso horário
5. Estado dos serviços
6. Histórico de alterações

## 1. Identidade do clube

O Administrador Principal pode consultar e alterar:

- Nome do clube.
- Emblema do clube.
- Cores institucionais do clube.

Os ficheiros de emblema devem ser validados quanto ao formato, dimensão e tamanho antes de serem aceites. A interface deve apresentar uma pré-visualização da identidade proposta.

## 2. Identidade da equipa

O Administrador Principal pode consultar e alterar:

- Nome da equipa.
- Emblema da equipa.
- Cores da equipa.

A identidade da equipa é independente da identidade do clube. Deve existir pré-visualização antes de guardar.

### Confirmação e aplicação das alterações de identidade

- Qualquer alteração ao nome, emblema ou cores do clube ou da equipa exige uma etapa de confirmação.
- A pré-visualização apresenta as alterações propostas e disponibiliza as ações **Cancelar** e **Guardar alterações**.
- Nenhuma alteração é aplicada antes da confirmação explícita.
- Depois de guardar, a identidade atualizada é utilizada na época atual e nos novos registos e documentos.
- As épocas anteriores preservam a identidade que tinham na altura.
- Relatórios, documentos e registos históricos não podem ser modificados retroativamente pela alteração da identidade atual.
- A implementação deve garantir snapshots/versionamento da identidade associados aos registos históricos relevantes; não basta apresentar sempre os valores atuais do clube/equipa.

## 3. Época desportiva — consulta apenas

O Administrador Principal pode consultar:

- Identificação da época ativa.
- Estado da época.
- Datas ou informação temporal disponíveis no registo da época.

Não pode criar, trocar, encerrar ou reabrir épocas, nem alterar o estado da época.

O encerramento e a reabertura permanecem sob responsabilidade exclusiva do Treinador Principal, com registo de auditoria, conforme as regras do módulo de épocas.

## 4. Localização e fuso horário

O Administrador Principal pode alterar, sempre que necessário:

- País.
- Localidade.
- Fuso horário.

Valores iniciais propostos para a instalação em Portugal:

- País: Portugal.
- Fuso horário: `Europe/Lisbon`.

O fuso horário deve ser selecionável através de identificadores IANA e a aplicação deve respeitar automaticamente as regras de hora de verão/inverno desse fuso.

As alterações aplicam-se aos novos horários e eventos. Os registos históricos devem preservar o instante original (timestamp) e a informação de fuso/contexto necessária para não serem reinterpretados retroativamente.

## 5. Estado dos serviços

Esta secção é exclusivamente informativa. Deve apresentar, quando a informação estiver tecnicamente disponível:

- Autenticação e gestão de contas.
- Base de dados.
- Armazenamento de documentos, fotografias e vídeos.
- Notificações push e internas.
- Sincronização e funcionamento offline.
- Estado geral da plataforma.
- Limitações, indisponibilidades e erros relevantes.

Não existem controlos para ativar/desativar funcionalidades, contratar serviços, realizar upgrades, alterar planos ou iniciar faturação. Não se devem apresentar estados fictícios: cada indicador deve refletir uma verificação real ou ser identificado como “Não verificado/Não disponível”.

## 6. Histórico de alterações

O Administrador Principal pode consultar um histórico de alterações às configurações, incluindo:

- Utilizador responsável.
- Configuração/entidade alterada.
- Valor anterior.
- Novo valor.
- Data e hora.
- Resultado da operação, quando aplicável (concluída ou falhada).

O histórico é de consulta e não pode ser editado ou apagado através da interface. Os registos devem ser produzidos no servidor, protegidos por permissões e RLS adequadas, e não depender apenas de dados enviados pelo cliente.

## Permissões e segurança

- Só o perfil `administrador_principal` pode abrir este módulo.
- A restrição deve ser aplicada na interface e no backend/base de dados; ocultar o menu não é controlo de segurança suficiente.
- Treinador Principal, Staff e Jogadoras não podem consultar nem alterar as configurações globais nem o respetivo histórico.
- Validar a autorização em cada operação de leitura e escrita no servidor.
- Aplicar RLS às tabelas expostas ao cliente.
- Validar uploads e impedir acesso não autorizado aos ficheiros.
- Não expor chaves privilegiadas ou segredos no frontend.
- Não ativar serviços pagos, faturação automática ou upgrades.

## Critérios de aceitação

1. O Administrador Principal vê exatamente os seis separadores definidos.
2. Os restantes perfis não conseguem abrir o módulo nem consultar os dados por chamadas diretas ao backend.
3. As identidades do clube e da equipa podem ser alteradas com pré-visualização e confirmação explícita.
4. Cancelar a confirmação não altera dados.
5. As épocas anteriores e os documentos históricos mantêm a identidade original após uma alteração.
6. A época ativa e o seu estado são consultáveis, mas não editáveis pelo Administrador.
7. País, localidade e fuso horário são editáveis pelo Administrador.
8. A conversão de datas respeita as regras IANA e não altera instantes históricos.
9. O estado dos serviços reflete verificações reais e não disponibiliza controlos de ativação, desativação, upgrades ou faturação.
10. O histórico regista as alterações com autor, valores anterior/novo, data/hora e resultado, e não permite edição ou eliminação pela interface.
11. Existem testes positivos e negativos de permissões para os quatro perfis.
12. Existem testes de validação de uploads, confirmação/cancelamento, preservação histórica, fuso horário e auditoria.
13. O módulo é responsivo e acessível em computador, tablet e telemóvel.

## Plano de implementação

1. Rever o modelo de dados atual e identificar as entidades existentes de clube, equipa, época, localização e auditoria.
2. Definir migrações e políticas RLS apenas depois de confirmar o esquema real, sem executar migrações remotas automaticamente.
3. Implementar os serviços de leitura/escrita e a auditoria no backend.
4. Implementar os seis separadores e os fluxos de confirmação no frontend.
5. Acrescentar testes unitários, de integração, permissões e regressão.
6. Validar os workflows de CI e publicação antes de considerar o módulo disponível.

## Limites desta especificação

Esta especificação regista as decisões funcionais aprovadas. Não declara o módulo implementado, nem pressupõe que já existam tabelas, endpoints ou verificações de estado dos serviços. Esses elementos devem ser confirmados no código e no esquema real antes da implementação.

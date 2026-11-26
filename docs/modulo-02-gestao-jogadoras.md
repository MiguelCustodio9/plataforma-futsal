# Módulo 02 — Gestão de Jogadoras (Plantel)

## Objetivo e ponto de partida

O módulo substitui o estado de demonstração da área **Plantel** por uma gestão persistente de jogadoras, integrada com Supabase e com os papéis já existentes em `profiles`. A implementação será incremental; o Módulo 01 — Staff não deve sofrer alterações funcionais.

## Decisões funcionais já definidas

### Identidade e ficha pessoal

- Cada jogadora recebe um identificador interno único, automático e permanente, independente do nome, número, posição ou época. Mantém-se após correções e regressos.
- A ficha pessoal mantém-se entre épocas.
- Campos já definidos: nome, nome completo, sexo, data de nascimento (idade calculada automaticamente), país e localidade de nascimento, nacionalidade e eventual dupla nacionalidade, pé dominante (Esquerdo/Direito/Ambos), número preferido (1–99), prática federada, clube/equipa anterior, desportos praticados e atividades extra-desportivas.
- Posições: GR, Fixo, Ala, Pivot e Universal. A posição secundária não é permitida quando a posição principal é Universal.
- Escalões calculados a partir do ano de nascimento:
  - Petizes: 2020–2022
  - Traquinas: 2018–2019
  - Benjamins: 2016–2017
  - Infantis: 2014–2015
  - Iniciados: 2012–2013
  - Juvenis: 2010–2011
  - Juniores: 2008–2009
  - Seniores: até 2007
- A idade é calculada automaticamente; o escalão apresentado deve respeitar a regra de anos acima e a época configurada.

### Fotografia

- Existe uma única fotografia principal, partilhada pela identidade de acesso e pela ficha desportiva; não existe galeria adicional.
- Apenas o Treinador Principal pode alterar a fotografia.

### Inscrição por época e número

- A inscrição desportiva é feita por época, mantendo a ficha pessoal e o histórico.
- O número preferido pertence à ficha pessoal.
- O número efetivo de camisola é definido por época, pode mudar entre épocas e mantém histórico, incluindo datas de vigência.

### Estado desportivo

O estado desportivo é independente do estado da conta e admite:
- Ativa
- Lesionada
- Inativa
- Arquivada

O Staff autorizado pode alterar o estado, ficando registados o histórico, a data e o responsável. A situação Inativa mantém a inscrição e as respetivas datas. O arquivamento e a eliminação definitiva são operações distintas; a eliminação definitiva só deve existir com confirmação e regras de integridade adequadas.

### Avaliações

- Avaliações físicas, técnicas e táticas associadas à jogadora e à época/data da avaliação.
- As avaliações são exclusivamente numéricas: não existem campos de comentários ou observações.
- Técnica e tática usam escala de 1 a 5.
- Indicadores físicos já definidos: altura (cm), peso (kg), IMC calculado automaticamente, perímetro abdominal, velocidade, agilidade, resistência, potência, equilíbrio, força e coordenação.
- O histórico de avaliações deve permitir acompanhar a evolução ao longo do tempo sem substituir registos anteriores.
- Não se devem inventar escalas para indicadores físicos que ainda não tenham sido formalmente especificadas.

### Pedidos de correção e auditoria

- A jogadora pode solicitar correções aos seus dados.
- A jogadora não altera diretamente a ficha; apenas Staff autorizado pode aprovar e executar alterações.
- Cada pedido, decisão, alteração, data e responsável ficam registados para auditoria.
- A jogadora consulta os dados atualizados depois da correção.

### Exportação

- O Staff pode imprimir e exportar a ficha completa em PDF e Excel, respeitando as permissões de acesso.
- A exportação inclui a fotografia principal, sem criar uma galeria.

### Acesso da jogadora

- A jogadora consulta apenas o perfil da época atual.
- Depois de terminar uma época, não pode consultar o perfil histórico dessa época nem de épocas anteriores.
- Esta restrição prevalece sobre a consulta histórica disponível ao Staff.

## Permissões de referência

- Administrador Principal e Treinador Principal: gestão global do plantel, conforme permissões funcionais a implementar.
- Staff: acesso de gestão limitado às permissões atribuídas; pode consultar/exportar fichas quando autorizado.
- Jogadora: consulta limitada ao seu próprio perfil da época atual e pode submeter pedidos de correção.
- Convites de jogadoras ficam fora desta fase; serão implementados com fluxo e email próprios, separado dos convites Staff.

## Estrutura técnica existente

- Frontend: React, TypeScript, Vite e Tailwind/CSS existente.
- Backend: Supabase (PostgreSQL, Auth, RLS e Storage).
- Papéis existentes em `public.app_role`: `administrador_principal`, `treinador_principal`, `staff`, `jogadora`.
- A autenticação e o módulo Staff estão implementados. A área Plantel ainda é um placeholder.
- As alterações à base de dados devem ser entregues como nova migration versionada. A migration Staff já aplicada não deve ser repetida nem alterada retroativamente.

## Sequência de implementação

1. Modelo de dados e migration nova: jogadoras, inscrições por época, histórico de camisolas, estados, avaliações, pedidos de correção e auditoria.
2. RLS e funções de autorização, com testes explícitos para cada papel.
3. Interface Plantel: listagem, pesquisa, filtros, criação e edição de fichas.
4. Perfil da jogadora e gestão das inscrições por época.
5. Avaliações e evolução histórica.
6. Pedidos de correção e respetivo circuito de aprovação.
7. Exportação PDF/Excel e validação de permissões.
8. Convites de jogadoras, em fase própria e sem reutilizar o convite Staff.

## Regras de segurança e qualidade

- Não confiar apenas em esconder botões: todas as permissões devem ser impostas por RLS/funções no Supabase.
- Não expor dados de outras jogadoras a uma conta Jogadora.
- Validar duplicados, datas, número de camisola, posições e coerência entre nascimento e escalão.
- Testes automáticos para permissões, validações, persistência e isolamento entre contas.
- Não aplicar migrations automaticamente no projeto remoto; rever e aplicar manualmente no SQL Editor, seguindo o processo já usado no Módulo 01.

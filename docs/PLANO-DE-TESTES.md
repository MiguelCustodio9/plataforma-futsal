# Plano de testes

## Em cada módulo

- Testes unitários das regras de negócio.
- Testes de componentes e formulários.
- Testes de integração com backend.
- Testes de permissões por perfil.
- Testes negativos para acesso não autorizado.
- Testes de regressão antes de avançar.

## Segurança

- RLS ativa em todas as tabelas acessíveis pelo cliente.
- Verificar isolamento entre jogadoras.
- Verificar operações exclusivas do Treinador Principal e Admin Principal.
- Validar uploads, tamanho, tipo e permissões.
- Verificar que segredos não aparecem no bundle, logs ou repositório.
- Testar recuperação de conta, sessões e 2FA quando implementados.

## Compatibilidade

Validar Chrome, Edge, Firefox e Safari, em computador, tablet e telemóvel.

## Critério de conclusão

Um módulo só é considerado concluído quando os testes passam, as permissões são verificadas e os fluxos principais foram testados nos tamanhos de ecrã suportados.

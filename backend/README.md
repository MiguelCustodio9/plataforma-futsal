# Backend

O backend previsto utiliza Supabase, sujeito a validação do plano gratuito, quotas e eventuais custos.

Ainda não existe ligação a um projeto Supabase. Não criar nem colar credenciais neste repositório.

Antes de ativar o backend:
- confirmar limites e condições atuais do plano gratuito;
- confirmar ausência de faturação automática;
- desenhar o modelo relacional;
- definir políticas RLS por tabela;
- testar isolamento entre utilizadores e perfis;
- manter a chave `service_role` exclusivamente em ambiente de servidor.

# Instruções para agentes de IA

**Primeira ação ao iniciar ou retomar uma tarefa neste repositório:** leia integralmente o `AGENTS.md` da raiz. Antes de editar, leia também as instruções específicas dos diretórios afetados. Aplique as regras locais ao respectivo escopo. Identifique a tarefa, os critérios de aceite e os comandos de validação do projeto.

## Fluxo no GitHub

- Para cada correção, melhoria ou nova função, procure a issue correspondente e reutilize-a. Quando faltar, abra uma issue com o objetivo e um resultado verificável.
- Trabalhe em uma branch dedicada e entregue por pull request. Vincule a issue na descrição com `Closes #N` quando o PR a resolver por completo ou `Refs #N` em entregas parciais.
- No PR, informe o que mudou, como foi validado e o que está pendente. Siga as verificações, aprovações e o processo de publicação do projeto. Distinga PR aberto, merge, prévia e produção verificada.

- Após revisar o diff da versão atual do PR e confirmar que os testes pertinentes e as verificações obrigatórias passaram, o agente deve fazer o merge sem pedir nova aprovação de rotina. Respeite revisões obrigatórias, proteções da branch e instruções explícitas de aguardar. Se houver falha, conflito ou risco concreto de regressão, resolva o que estiver no escopo e registre o bloqueio restante. Após o merge, acompanhe o fluxo de publicação previsto e informe separadamente o commit integrado e o estado do deploy.

## Interface e carregamento

- Ao alterar uma interface, cubra os estados aplicáveis de carregamento, conteúdo, vazio, sucesso e erro. Use skeleton quando o formato do conteúdo for previsível e reserve espaço para evitar saltos na tela.
- Carregue sob demanda a mídia fora da primeira tela. Priorize o conteúdo inicial. Em operações demoradas, mostre atividade e apresente porcentagem somente quando houver progresso mensurável.
- Use transições de entrada e saída para esclarecer mudanças de estado. Respeite `prefers-reduced-motion`, navegação por teclado e foco. Confira o fluxo nos tamanhos de tela suportados pelo projeto.
- Referência de movimento: https://github.com/kylezantos/design-motion-principles

## Observabilidade e qualidade

- Reutilize os serviços e comandos já configurados. Ao mudar um fluxo crítico, confira como detectar e diagnosticar falhas. Proteja credenciais e dados pessoais em logs, testes e relatórios.
- Execute lint, build e testes pertinentes à alteração. Use testes unitários para regras, integração para fronteiras entre componentes e ponta a ponta para jornadas críticas. Cubra regressões relevantes.
- Registre comandos e resultados reais. Identifique testes simulados e verificações que ficaram pendentes. Escolha ferramentas pela necessidade do projeto e avalie custos e sobreposição antes de adicionar um serviço.

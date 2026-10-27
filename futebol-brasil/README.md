# Futebol Brasil — correção do modo automático

Correção de 27/10/2026, baseada no PR #1, commit `87c54ebf40c44e6591c523a23d5bc0b8bd1a750f`.

## O problema e a correção

Foram comparadas duas versões diferentes:

| Versão | Comportamento original | Correção |
| --- | --- | --- |
| PR #1 (`index.html`) | O cálculo de uma rodada inteira bloqueava a interface; Parar só limpava o temporizador do auxiliar. Os controles eram recriados a cada minuto, podendo perder um toque em andamento. | Cálculo em pequenos blocos, cancelamento por sessão, botão fixo e controles estáveis. |
| Arquivo `Futebol_Brasil_Mobile.html`, versão salva 3 | Ao concluir o quinto jogo, `UI.live` era removido e `autoOff()` chamava `render()` ainda na tela ao vivo. `liveShell()` tentava acessar `null.ms`, deixando “Fim de jogo” e o botão antigo na tela. | Não redesenhar a tela ao vivo sem uma partida; concluir a volta ao painel normalmente. |
| Arquivo mobile | Parar antes do apito deixava `paused=true`, mas Apito inicial apenas chamava `tick()`, que retornava sem avançar. | Apito inicial remove a pausa e inicia um único relógio. |
| Ambas | A substituição automática da partida podia continuar ativa depois de desligar o auxiliar. | Restaurar a preferência do usuário para lesões, mantendo as regras determinísticas do online. |

A reprodução na versão mobile anterior retornou `min: 0, paused: true, autoSub: true` após parar e tocar no apito, mesmo com a preferência de substituição desligada. No quinto jogo ocorreu `Cannot read properties of null (reading 'ms')`. Isso explica a tela informada pelo usuário; não pressupõe acesso à carreira dele.

O jogo mantém os modos e as regras anteriores. O PR continua com automático até o fim da temporada; o arquivo mobile conserva o limite de cinco partidas. Não foram adicionados modos ou dependências ao jogo: Playwright serve apenas aos testes.

## Como usar

1. Guarde um backup da carreira antes de trocar de endereço ou navegador. No arquivo mobile, use **Opções → Baixar backup**; no PR, use o código de exportação. Se a tela antiga já travou, recarregar usa o último salvamento concluído — o quinto jogo pode precisar ser repetido. Não apague os dados do navegador.
2. Para testar esta versão no computador, na pasta do repositório execute `python3 -m http.server 8000` e abra `http://localhost:8000/futebol-brasil/`.
3. Para iPhone/Android, hospede o HTML em um endereço HTTPS e abra no Safari/Chrome. A visualização de um arquivo anexo ou a página de código do GitHub não equivale a uma página de jogo publicada. Na mesma rede, também é possível testar pelo IP local do computador e a porta 8000.
4. Ative **Modo automático** (ou **Simular 5 jogos** no mobile). **Voltar ao manual** permanece no topo, inclusive ao rolar a tela. Ao parar, use **Apito inicial**, **Retomar** ou **Continuar**, conforme o momento da partida.

Em datas sem jogo de nenhum técnico humano, a data em cálculo é concluída e registrada antes de parar, para não deixar resultados parciais. O cancelamento impede a próxima data automática. Durante uma partida ao vivo, a parada ocorre entre pequenos blocos do cálculo.

Os saves continuam locais ao navegador e ao endereço do jogo. Copiar o HTML não migra a carreira. No mobile, importar o backup substitui a carreira daquele modo; guarde o backup anterior. Esta mudança não publica o site nem altera o ramo `main`.

## Online: limites reais

- **PR #1:** usa `window.claude.use('db')`, identificação/permissões do Claude e coleções `games` e `games/<id>/t`. O HTML publicado sozinho em GitHub Pages não fornece esse serviço. Uma página no Claude também precisa disponibilizar essas capacidades e permitir gravações.
- **Arquivo mobile:** usa outro contrato: `/api/online/session`, salas, turnos e confirmação de rodada, com sessão autenticada. O arquivo não contém esse servidor. Um host estático não implementa essas rotas.
- Desligar o auxiliar não cancela uma confirmação já enviada ao amigo. No PR, o cronômetro da sala continua podendo avançar a rodada quando o prazo acabar; isso é separado do modo automático.
- Os testes verificam que dividir os cálculos em blocos preserva os mesmos resultados para mundos de versões 2 a 7 e que parar não altera a confirmação nem as substituições online. **Não houve teste com duas contas reais ou com o servidor publicado.** Autorização, persistência, concorrência e recuperação de conexão do backend ainda precisam ser validadas no ambiente que o hospeda.
- Não foi criado um novo backend, migradas salas ou prometido funcionamento offline/instalação com apenas um HTML.

## Testes reproduzíveis

Requer Node.js 20 ou superior. Na pasta `futebol-brasil`:

```sh
npm ci
npx playwright install --with-deps chromium webkit
npm test
npm run test:webkit
```

Para testar o arquivo mobile corrigido baixado separadamente, use o mesmo conjunto:

```sh
FB_HTML_PATH=/caminho/Futebol_Brasil_Mobile.html npm test
FB_HTML_PATH=/caminho/Futebol_Brasil_Mobile.html npm run test:webkit
```

No PowerShell, defina `$env:FB_HTML_PATH` e `$env:FB_BROWSER` antes de executar `npm test`. Os testes iniciam seu próprio servidor local, bloqueiam conexões externas e usam carreiras sintéticas. Não acessam os saves do usuário nem o backend real.

Cobertura: parar antes do apito, interromper sob carga, preservação dos botões entre pinturas, parar após o apito final, ligar/desligar rapidamente, impedir finalização duplicada, parar ao ocultar a página, datas sem jogo humano, save/exportação/reabertura, online sem servidor, determinismo nas versões 2–7 e telas de 320×568, 390×844, 412×915 e 844×390. No mobile também são testados cinco jogos completos e a parada em uma rodada de Libertadores/Champions em uma carreira configurada para 2028.

Validação executada: Chromium 140 e WebKit 26.5 em Linux, com toque e viewport móvel simulados. O ambiente usou Playwright 1.55.1 para Chromium e 1.62.1 para WebKit. A instalação acima fixa 1.62.1 para reproduzir em uma máquina atual. Emulação não substitui uma verificação no iPhone e Android físicos, especialmente em aparelhos mais lentos e ao voltar de segundo plano.

| Arquivo | Chromium | WebKit |
| --- | --- | --- |
| PR corrigido | 13 passaram; 2 exclusivos do mobile ignorados | 13 passaram; 2 exclusivos do mobile ignorados |
| Mobile corrigido | 15 passaram | 15 passaram |

Total: 56 execuções aprovadas, nenhuma falha. A inspeção visual confirmou os controles acessíveis; nenhuma carreira real foi alterada durante os testes.

## Conferência rápida no celular

1. Ligue o automático e pare antes do apito; Apito inicial deve funcionar.
2. Ligue novamente e pare durante os cálculos; deve aparecer o controle manual sem reabrir o jogo.
3. No mobile, deixe os cinco jogos terminarem; o painel deve voltar e Jogar deve abrir a próxima partida.
4. Troque de aplicativo durante o automático e volte; ele deve estar desligado.
5. Exporte um backup, reabra o mesmo endereço e confira a carreira salva.

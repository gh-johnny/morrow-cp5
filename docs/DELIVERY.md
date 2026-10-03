---
title: Morrow — entrega técnica e reprodução
status: experimental
created: 2026-10-03
last-updated: 2026-10-03
last-reviewed: 2026-10-03
---

# Morrow — entrega técnica

FIAP · Mobile Development and IoT · CheckPoint 5

João Marcelo Furtado Romero — RM555199<br>
Matheus Rivera Montovaneli — RM555499<br>
André Nakamatsu Rocha — RM555004

Esta referência descreve a POC para professores e integrantes, verificada contra `shared/`, `src/`, `server/src/`, regras, configurações e testes. O [README](../README.md) contém os links públicos e o início rápido.

## Requisitos do enunciado

| Requisito | Implementação e fonte |
| --- | --- |
| E-mail/senha, sessão e logout | Firebase Auth; `src/providers/session.tsx`; logout limpa token e listeners |
| Cadastro completo | Nome, e-mail, senha/confirmação, telefone, nascimento e upload de foto; `src/app/auth.tsx` |
| Perfil privado | API exige conversa comum para perfil completo; descoberta mostra nome/foto; `server/src/users.ts` |
| Direta única, dois membros | ID determinístico do par, transação e rejeição de si mesmo; `server/src/conversations.ts` |
| Grupos, dono, imagem e capacidade | Capacidade inteira inclui dono; transação para alterações/entradas; nunca abaixo da ocupação |
| Foto → perfil/integrantes | Foto no chat abre perfil direto ou lista completa do grupo; seleção abre perfil autorizado; `src/app/chat/[id].tsx` |
| Remoção de integrante | ACL RTDB versionada a partir de metadados; revoga leitura/envio/push |
| Tempo real e persistência | RTDB para mensagens, listeners com cleanup; `src/hooks/data.ts` |
| Firestore e RTDB | Firestore: perfis/metadados/configurações; RTDB: mensagens/presença/canvas/foco/sinalização |
| Mídia por URL | Bytes enviados ao servidor, Blob privado, URL assinada curta; `server/src/media.ts` |
| API própria online | Express + Firebase Admin, ID token revogado validado; `api/index.ts`; sem Cloud Functions |
| Push e idempotência | Evento determinístico e reserva por dispositivo; remetente excluído; `server/src/notifications.ts` |
| Tokens e destinatários privados | Dispositivos privados; consulta de participação/política atual antes de envio |
| Abertura por push | Payload com conversationId/type/messageId/eventId; `src/providers/notifications.tsx` |
| Configuração real versionada | `firebaseConfig.json`, `google-services.json`, `firestore.rules`, `database.rules.json` |
| Hooks/estados tipados | Camadas de contrato/API/hooks/UI; carregamento, vazio, erro, cache e fila offline |

## Políticas de notificação

| Política | Destinatários calculados no servidor |
| --- | --- |
| `all_group_messages` | Integrantes atuais, exceto remetente |
| `mentioned_members` | Integrantes atuais mencionados, exceto remetente |
| `direct_messages_only` | Apenas diretas; nenhum push daquele grupo |
| `disabled` | Nenhum push |

Menções permanecem visíveis a todos. Preferências pessoais podem reduzir destinatários, sem ampliar a política do grupo. Horário de silêncio adia eventos até o fim da janela. Silenciar conversa, ocultar prévia e revogar dispositivo são escolhas individuais.

Aceite Expo, confirmação FCM/APNs, recebimento no app e abertura são etapas distintas. Falha de rede ambígua após envio fica como entrega incerta; repetir automaticamente poderia duplicar a notificação. Receipts com DeviceNotRegistered limpam o token sem apagar a chave NaCl.

## Matriz dos dezesseis extras

| Recurso | Comportamento e onde experimentar |
| --- | --- |
| 1. Kite contextual | Conversa → Kite: resumo/perguntas, citações literais autorizadas e tarefas propostas para confirmação |
| 2. Áudio pesquisável | Gravação/upload, waveform, velocidades 1/1,5/2, transcrição real e timestamps pesquisáveis |
| 3. Mensagem → tarefa | Ações da mensagem; responsável/prazo/checklist e Kanban TODO/DOING/DONE |
| 4. Enquetes e agenda | Workspace → enquetes; votos sincronizados e disponibilidade múltipla |
| 5. Threads | Respostas em tópico, acompanhamento, leitura/não lidas, reações, edição e fixação |
| 6. Memória visual | Ideias/decisões com fontes; grafo de relações e exportação |
| 7. Canvas colaborativo | Notas/desenhos Yjs, cursores por sessão, fila de atualizações offline |
| 8. Radar explicável | Prazo vencido, tarefa parada e conversa sem resposta; mostra regra e fonte |
| 9. Atenção | Menções, atribuições, tópicos acompanhados e decisões com ligação à origem |
| 10. Seu ritmo | Push pessoal, silêncio, prévia, conversas silenciadas, dispositivos e biometria nativa |
| 11. Observatório push | Etapas de entrega separadas, exclusões por política e entregas incertas |
| 12. Blackout Lab | Fila durável após fechar/reabrir; IDs estáveis evitam mensagem duplicada |
| 13. Convites | QR/link, validade/usos/revogação/aprovação; admissão respeita capacidade |
| 14. Foco | Timer compartilhado com relógio do servidor, meta, pausa, checkpoint, histórico e pontos Kite |
| 15. Chamadas | WebRTC voz/vídeo real até quatro participantes; STUN e suporte configurável a TURN |
| 16. Proteção por dispositivos | NaCl para novos textos diretos; envelopes, fingerprints, QR e revogação |

## Limites e status dos provedores

A proteção por dispositivos cobre **novos textos de conversas diretas**. Anexos, chamadas, metadados e mensagens antigas ficam fora. Kite e anexos são bloqueados na conversa protegida. Uma chave nova não recupera histórico de chave revogada. Confirme fingerprints com a outra pessoa por canal conhecido; o QR não cria confiança automaticamente.

Gemini recebe apenas mensagens autorizadas sem essa proteção. O modelo principal é `gemini-3.5-flash-lite`, com `gemini-3.8-flash` como alternativa; há prazo de resposta, validação de JSON e filtragem de citações. Tarefas exigem confirmação. Transcrições podem conter erros, e o áudio original permanece disponível. Chave de IA fica no servidor.

Chamadas usam STUN/conexão direta. `TURN_URLS` e `TURN_SHARED_SECRET` habilitam credenciais TURN temporárias no servidor. **O ambiente público ainda não tem TURN**; redes restritivas podem impedir chamadas, condição informada na interface.

Upload: até **3 MB**, tipos permitidos no servidor. Gravação: até **120 segundos**. Conta: até **16 identidades ativas de dispositivo**. Há limites por usuário e de IA. São limites da POC acadêmica.

O Firebase permanece no plano gratuito. Firestore oferece 50.000 leituras e 20.000 escritas por dia, com renovação perto da meia-noite do Pacífico. Esse limite pode interromper consultas até a renovação. A API informa indisponibilidade temporária; o aplicativo preserva mensagens na fila. Requisições da mesma foto são compartilhadas por identidade para reduzir leituras repetidas. [Cotas oficiais](https://firebase.google.com/docs/firestore/quotas).

No Expo 57, consultar o token Android também emite o evento de token. O listener reutiliza o token recebido ao registrar no Expo, evitando uma nova consulta que produziria um ciclo. O teste de regressão simula esse eco, uma rotação real e a remoção do listener. O ambiente final usa um Firebase novo após a cota do ambiente de validação anterior ter sido consumida por esse problema, já corrigido.

Upload nativo usa `File` de `expo-file-system` diretamente no `FormData` e `expo/fetch`, conforme a [documentação do Expo](https://docs.expo.dev/versions/v57.0.0/sdk/filesystem/). O teste de regressão usa o conversor multipart do SDK e rejeita a construção de Blob de ArrayBuffer incompatível com React Native.

## Desenvolvimento e publicação

```bash
npm ci
npm --prefix server ci
cp server/.env.example server/.env
# Preencha as credenciais somente no ambiente do servidor.
npm run api:dev
# .env.local: EXPO_PUBLIC_API_URL=http://localhost:4000/api
npm run web
```

No Android Emulator a API local usa `http://10.0.2.2:4000/api`; em aparelho físico use HTTPS acessível. Perfis EAS usam a API pública. `npm run build:apk` gera preview Android; `npm run build:ios` gera iOS simulator. WebRTC e SQLCipher exigem build nativo, não Expo Go.

Firebase público acadêmico: **morrow-cp5-final-555199**. Para outro projeto, ative apenas E-mail/senha, crie Firestore/RTDB, registre clientes web/Android e substitua configurações públicas. A conta Admin da API precisa de Firestore/RTDB e leitura/validação Auth; a credencial FCM dedicada usa `roles/firebasecloudmessaging.admin`.

```bash
npx firebase-tools@15 deploy --only firestore:rules,firestore:indexes,database --project YOUR_PROJECT
```

`vercel.json` publica `api/index.ts` e export estático Expo. Configure variáveis de `server/.env.example` no host; jamais no bundle cliente. Não usa Cloud Functions.

Na Vercel: conecte um **Blob privado** e configure `BLOB_READ_WRITE_TOKEN`; `PUBLIC_API_URL` deve apontar para a API HTTPS publicada e `WEB_ORIGINS`, para os clientes autorizados. Publique com `npx vercel deploy --prod`. Mantenha `FIREBASE_PRIVATE_KEY` e demais segredos somente nas variáveis do servidor. O Admin usa transporte REST para chamadas curtas; leituras em tempo real do aplicativo continuam nos SDKs cliente.

## Referência da API

Base pública: `https://morrow-cp5.vercel.app/api`. Rotas de usuário exigem Firebase ID token de E-mail/senha. Mutações colaborativas passam pela API; leituras em tempo real usam listeners Firestore/RTDB protegidos pelas regras.

| Método e caminho | Comportamento |
| --- | --- |
| `GET /health` | Consulta Firestore e informa disponibilidade/configuração; não comprova entrega de push ou funcionamento de IA |
| `GET /users`; `GET /users/me`; `GET /users/:uid`; `PUT /users/me` | Descoberta, perfil próprio/comum e atualização com foto enviada |
| `GET/PUT /users/me/preferences`; `GET/POST /users/me/devices` | Preferências e registro privado de identidade/token |
| `DELETE /users/me/devices/:id`; `POST /users/me/devices/:id/logout` | Revogação ou remoção de token no logout |
| `GET /conversations`; `GET /conversations/:id`; `POST /conversations/direct` | Listagem, autorização e direta canônica |
| `POST /conversations/groups`; `PATCH /conversations/:id` | Grupo, capacidade, integrantes, foto e política |
| `GET/POST /conversations/:id/messages`; `PATCH /conversations/:id/messages/:messageId` | Histórico, persistência idempotente e ações autorizadas |
| `POST /conversations/:id/read`; `POST /conversations/:id/threads/:threadId/subscribe` | Leitura e acompanhamento de tópicos |
| `POST /media`; `GET /media/:id/link`; `GET /media/:id` | Upload, link temporário e bytes com assinatura/autorização |
| `POST /notifications`; `POST /notifications/ack`; `GET /conversations/:id/notifications` | Envio, acknowledgements e cem eventos mais recentes do observatório |
| `POST /conversations/:id/tasks`; `PATCH /conversations/:id/tasks/:taskId` | Tarefa, responsável, prazo, checklist e status |
| `POST /conversations/:id/polls`; `POST /polls/:pollId/vote`; `POST /polls/:pollId/close` | Votação; os dois últimos caminhos também ficam sob `/conversations/:id` |
| `POST /conversations/:id/memories`; `DELETE /conversations/:id/memories/:memoryId` | Memória com fontes e relações |
| `POST /conversations/:id/board`; `POST/PATCH /conversations/:id/focus` | Atualização Yjs e ciclo de foco/checkpoint |
| `GET /conversations/:id/call/config`; `POST /call/join`, `/call/leave`, `/call/signal` | Configuração e sinalização; todos sob a conversa |
| `POST /conversations/:id/ai/ask`; `POST /conversations/:id/ai/transcribe` | Resposta com fontes e transcrição de mídia autorizada |
| `POST /conversations/:id/encryption`; `GET /conversations/:id/devices` | Modo de texto protegido e chaves públicas dos participantes |
| `POST /invitations`; `GET/DELETE /invitations/:token`; `POST /invitations/:token/join`; `POST /conversations/:id/join-requests/:uid` | Convite, entrada e decisão do proprietário |
| `POST /jobs/run` | Worker exclusivo com bearer `CRON_SECRET`; cem eventos recentes por execução para receipts |

Disponibilidade: `curl -f https://morrow-cp5.vercel.app/api/health`. Principais respostas: 400 dados inválidos; 401 sessão; 403 acesso; 404 recurso; 409 capacidade/estado; 429 frequência/cota de IA; 503 cota/configuração temporariamente indisponível. Validações e contratos ficam em `shared/contracts.ts` e `server/src/`.

`POST /api/jobs/run` exige `Authorization: Bearer CRON_SECRET`. O workflow `.github/workflows/notification-jobs.yml` retoma eventos e consulta receipts a cada cinco minutos. Configure GitHub Actions **MORROW_CRON_SECRET** com o mesmo segredo do servidor. A API rejeita execução pública não autenticada.

As regras negam escrita cliente em mensagens e metadados autoritativos. Presença/typing/cursor são limitados à própria identidade e participação. Perfis completos e tokens ficam privados. O servidor revalida participação antes de mídia/push. ACLs usam versão para evitar restauração por operação atrasada.

No nativo, journal SQLCipher e chave aleatória SecureStore. No navegador, IndexedDB/AES-GCM com chave não extraível. IDs de mensagem e evento push são estáveis e separados. A chave NaCl privada permanece no armazenamento protegido do dispositivo.

`firebaseConfig.json` e `google-services.json` são configurações públicas, exigidas na entrega. Firebase Admin, token Blob, chave Gemini, FCM/keystore e contas QA são privados e ignorados no Git/EAS/Vercel.

## Push Android e iOS

**Android:** build vinculado ao projeto EAS, pacote `br.com.morrow.cp5`, google-services correto e FCM v1 configurado. Perfil → **Ativar push neste dispositivo**, permita notificações. Envie com outra conta, destinatário em segundo plano; toque abre a conversa. Compare as etapas no observatório.

**iOS:** o usuário confirmou ausência de Apple Developer/iPhone; o push será validado no Android. Para habilitar iOS depois:

1. Conta Apple Developer ativa; App ID `br.com.morrow.cp5` com Push Notifications.
2. Crie/associe APNs Auth Key nas credenciais iOS do EAS.
3. `npx eas-cli@latest build --platform ios --profile production` com assinatura válida.
4. Instale no iPhone, autorize notificações e registre pelo perfil.
5. Envie de outra conta; confirme receipt APNs, recebimento e toque.

O perfil simulator serve para build/interface macOS; não comprova push APNs em iPhone. Permissões câmera, microfone e Face ID estão em `app.json`.

## Testes e reprodução

```bash
npm run verify
# Firebase emulators exigem Java 21; portas dedicadas em firebase.test.json.
npm run test:rules
npm run export:android
npm run export:web
npx expo-doctor
```

Integração real é opt-in: `.local/fixtures.json` contém array privado de contas QA com email/password; nunca versione. Prepare contas em seu ambiente. O smoke gera `.local/scenario.json`; E2E e verificação de áudio usam esse cenário. Não altere backend/proteção da conversa durante E2E.

```bash
TEST_API_URL=https://morrow-cp5.vercel.app/api npx tsx --env-file=server/.env scripts/smoke-cloud.ts
E2E_BASE_URL=https://morrow-cp5.vercel.app E2E_API_URL=https://morrow-cp5.vercel.app/api npm run test:e2e
# verify-ai também exige .local/speech.mp3 com áudio falado de teste.
TEST_API_URL=https://morrow-cp5.vercel.app/api npx tsx scripts/verify-ai.ts
```

Verificados: domínio/NaCl; seis cenários de regras; API pública com Auth real, disputa pela última vaga, isolamento/remoção, replay, tarefas/enquetes/memória/canvas e IA; navegador com Blackout/reabertura, colaboração/foco, criptografia e transporte WebRTC real. Android Emulator API 35 com Google Play Services: gravação e upload de áudio, fila SQLCipher preservada no reinício com o mesmo ID, replay único, reprodução a 2×, push FCM com abertura/recebimento, registro de token estável, chamada Android ↔ Chromium com bytes RTP recebidos e biometria virtual. O binário iOS de simulador compilou e contém as permissões; runtime/APNs dependem do ambiente Apple indisponível. [Resultados nativos](evidence/native-verification.json).

`expo-doctor`: 20/21; o aviso restante é a classificação WebRTC/New Architecture no React Native Directory. A validação Android inclui vídeo WebRTC entre Android e Chromium, além dos testes nativos documentados.

Release **v1.0.0**: [APK](https://github.com/gh-johnny/morrow-cp5/releases/download/v1.0.0/morrow-android.apk), [iOS simulator](https://github.com/gh-johnny/morrow-cp5/releases/download/v1.0.0/morrow-ios-simulator.tar.gz) e [SHA256SUMS](https://github.com/gh-johnny/morrow-cp5/releases/download/v1.0.0/SHA256SUMS.txt). CI passou com 13 testes unitários e seis cenários de regras; os três fluxos E2E foram verificados na API/interface publicadas.

## Evidências e apresentação

Imagens do app executado, capturadas com Playwright/Chromium em 2026-10-03:

- [Conversas](evidence/conversations-desktop.png) — lista real de conversas.
- [Chat](evidence/chat-desktop.png) — mensagens persistidas.
- [Canvas](evidence/canvas-desktop.png) — colaboração.
- [WebRTC](evidence/webrtc-desktop.png) — chamada entre dois navegadores.
- [IA](evidence/ai-verification.json) — citações e transcrição reais, com data/API registrada.

Capturas nativas com ADB, Android Emulator API 35 com Google Play Services, em 2026-10-03: [início Android](evidence/android-home.png), [canvas Android](evidence/android-canvas.png) e [notificações recebidas](evidence/android-push.png). Login, canvas e push usam Firebase/API reais. As três notificações correspondem à mensagem geral, menção explícita e conversa direta verificadas em [políticas push](evidence/push-policies.json).

Evidências adicionais: [abertura por push](evidence/android-push-open.png), [áudio em reprodução](evidence/android-audio.png), [fila após reinício](evidence/android-outbox.png), [chamada nativa](evidence/android-call.png) e [bloqueio biométrico](evidence/android-biometric.png). Vídeo de teste do emulador/Chromium comprova transporte entre clientes; o áudio gravado no emulador valida captura/arquivo/reprodução. A entrada falada sintética da prova de IA é transcrita pelo Gemini, separadamente.

Auditoria de dependências: npm audit registrou 37 avisos no cliente/tooling (25 high, 12 moderate) e 8 moderate no servidor; nenhuma critical. As recomendações incluem downgrades incompatíveis com SDK 57. Não foi aplicado audit fix --force; esses avisos permanecem como limite conhecido da POC.

Roteiro: duas contas e conversa direta; grupo pequeno/última vaga/remoção; texto/áudio/menção/thread; tarefa/voto/decisão/canvas; resumo com fonte/transcrição; Blackout e recuperação; chamada/fingerprints/texto protegido; push em segundo plano e abertura.

[Escopo e critérios](IMPLEMENTATION.md). CP4/Sprint3 serviram de referência de nível técnico; Morrow tem marca/interface/arquitetura próprias.

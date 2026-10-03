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

Gemini recebe apenas mensagens autorizadas sem essa proteção. Há fallback de modelo, validação de JSON e filtragem de citações; tarefas exigem confirmação. Transcrições podem conter erros, e o áudio original permanece disponível. Chave de IA fica no servidor.

Chamadas usam STUN/conexão direta. `TURN_URLS` e `TURN_SHARED_SECRET` habilitam credenciais TURN temporárias no servidor. **O ambiente público ainda não tem TURN**; redes restritivas podem impedir chamadas, condição informada na interface.

Upload: até **3 MB**, tipos permitidos no servidor. Gravação: até **120 segundos**. Conta: até **16 identidades ativas de dispositivo**. Há limites por usuário e de IA. São limites da POC acadêmica.

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

Firebase público acadêmico: **morrow-cp5-555199**. Para outro projeto, ative apenas E-mail/senha, crie Firestore/RTDB, registre clientes web/Android e substitua configurações públicas. A conta Admin da API precisa de Firestore/RTDB e leitura/validação Auth; a credencial FCM dedicada usa `roles/firebasecloudmessaging.admin`.

```bash
npx firebase-tools@15 deploy --only firestore:rules,firestore:indexes,database --project YOUR_PROJECT
```

`vercel.json` publica `api/index.ts` e export estático Expo. Configure variáveis de `server/.env.example` no host; jamais no bundle cliente. Não usa Cloud Functions.

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
TEST_API_URL=https://morrow-cp5.vercel.app/api npx tsx scripts/smoke-cloud.ts
npm run test:e2e
# verify-ai também exige .local/speech.mp3 com áudio falado de teste.
TEST_API_URL=https://morrow-cp5.vercel.app/api npx tsx scripts/verify-ai.ts
```

Verificados: domínio/NaCl; seis cenários de regras; API pública com Auth real, disputa pela última vaga, isolamento/remoção, replay, tarefas/enquetes/memória/canvas e IA; navegador com Blackout/reabertura, colaboração/foco, criptografia e transporte WebRTC real. O APK compilou. A validação nativa de push está em andamento.

`expo-doctor`: 20/21; o aviso restante é a classificação WebRTC/New Architecture no React Native Directory. Compilação Android passou; isso não substitui runtime.

## Evidências e apresentação

Imagens do app executado, capturadas com Playwright/Chromium em 2026-10-03:

- [Conversas](evidence/conversations-desktop.png) — lista real de conversas.
- [Chat](evidence/chat-desktop.png) — mensagens persistidas.
- [Canvas](evidence/canvas-desktop.png) — colaboração.
- [WebRTC](evidence/webrtc-desktop.png) — chamada entre dois navegadores.
- [IA](evidence/ai-verification.json) — citações e transcrição reais, com data/API registrada.

Capturas nativas com ADB, Android API 35, em 2026-10-03: [início Android](evidence/android-home.png) e [canvas Android](evidence/android-canvas.png). Login e canvas usam Firebase/API reais. A captura de push será vinculada após o APK corrigido.

Auditoria de dependências: npm audit registrou 37 avisos no cliente/tooling (25 high, 12 moderate) e 8 moderate no servidor; nenhuma critical. As recomendações incluem downgrades incompatíveis com SDK 57. Não foi aplicado audit fix --force; esses avisos permanecem como limite conhecido da POC.

Roteiro: duas contas e conversa direta; grupo pequeno/última vaga/remoção; texto/áudio/menção/thread; tarefa/voto/decisão/canvas; resumo com fonte/transcrição; Blackout e recuperação; chamada/fingerprints/texto protegido; push em segundo plano e abertura.

[Escopo e critérios](IMPLEMENTATION.md). CP4/Sprint3 serviram de referência de nível técnico; Morrow tem marca/interface/arquitetura próprias.

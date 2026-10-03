---
title: Morrow — conversas que viram movimento
status: experimental
created: 2026-10-03
last-updated: 2026-10-03
last-reviewed: 2026-10-03
---

# Morrow

**FIAP · Mobile Development and IoT · CheckPoint 5 · 3ESPW**

| Integrante | RM |
| --- | --- |
| João Marcelo Furtado Romero | RM555199 |
| Matheus Rivera Montovaneli | RM555499 |
| André Nakamatsu Rocha | RM555004 |

Conversas que viram movimento. Aplicativo novo em **Expo SDK 57, React Native e TypeScript**, com chat Firebase, API própria HTTPS e dezesseis recursos adicionais. Marca original: grafite, cítrico, Manrope, Space Grotesk e o companheiro geométrico Kite.

- **Aplicação:** https://morrow-cp5.vercel.app
- **API:** https://morrow-cp5.vercel.app/api ([health](https://morrow-cp5.vercel.app/api/health))
- **Código:** https://github.com/gh-johnny/morrow-cp5
- **Builds:** https://expo.dev/accounts/beo-johnny/projects/morrow-cp5
- **Enunciado:** [Chat, Firebase, grupos e push](https://github.com/anderltda/doc-react-native/blob/main/CPS/3ESPW/Segundo%20Semestre/README_TRABALHO_REACT_NATIVE_CHAT_FIREBASE_GRUPOS_PUSH.md)

## Começar

Node.js 24+ e npm:

```bash
npm ci
npm --prefix server ci
cp .env.example .env.local
npm run web
```

O cliente usa a API publicada. `firebaseConfig.json` e `google-services.json` contêm a configuração pública real do projeto acadêmico **morrow-cp5-555199**. Credenciais administrativas ficam exclusivamente no servidor.

```bash
npm run build:apk
npm run build:ios
npm run verify
```

**Use build nativo para Android/iOS:** WebRTC e SQLCipher exigem módulos que não estão no Expo Go. O perfil EAS `preview` gera APK; `simulator` gera iOS para simulador macOS.

## Recursos

Chat direto único; grupos com capacidade concorrente; menções; quatro políticas push; mídia autorizada; perfis privados. Extras: Kite com fontes, áudio pesquisável, tarefas/Kanban, enquetes/agenda, threads, memória visual, canvas Yjs, radar, atenção, preferências, observatório push, Blackout Lab, convites QR/link, foco compartilhado, chamadas WebRTC e criptografia NaCl por dispositivo.

A arquitetura combina Firebase Auth, Firestore e RTDB com API Express/Firebase Admin na Vercel, Blob privado, Gemini e Expo Push. O nativo guarda fila e chaves com SQLCipher/SecureStore; o navegador usa IndexedDB/AES-GCM. Não usa Cloud Functions.

## Documentação e evidências

- [Entrega técnica](docs/DELIVERY.md): requisitos, matriz dos 16 extras, políticas, configuração, segurança, testes e limitações.
- [Escopo aceito e critérios](docs/IMPLEMENTATION.md).
- [Evidências](docs/evidence): interface e integrações reais.

A API pública passou no teste com Auth real, concorrência, autorização, idempotência, colaboração e IA. Os testes de navegador verificam offline/reabertura, colaboração, criptografia e WebRTC real. O APK Android compilou; a validação nativa de push está em andamento. Push iOS será configurado posteriormente, conforme disponibilidade de Apple Developer/iPhone. TURN está implementado como configuração opcional e ainda não provisionado no ambiente público.

Para contribuir: leia a entrega técnica, mantenha as regras e contratos tipados, execute `npm run verify` e os testes de regras antes de alterar autenticação ou autorização. Nunca versione `.env`, contas QA ou chaves administrativas.

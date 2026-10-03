---
title: Morrow — accepted scope and verification criteria
status: internal
created: 2026-10-03
last-updated: 2026-10-03
last-reviewed: 2026-10-03
---

# Morrow — implementation ledger

FIAP · Mobile Development and IoT · CheckPoint 5

João Marcelo Furtado Romero — RM555199<br>
Matheus Rivera Montovaneli — RM555499<br>
André Nakamatsu Rocha — RM555004

## Accepted scope

Complete the teacher's Firebase chat assignment and all sixteen proposed additions.
Create a new identity, with no Obscurial/Nox or Ford branding.

## Product

Morrow turns conversation into coordinated action. Graphite, citrus, mineral white,
Space Grotesk, Manrope and an original geometric companion, Kite.

## Architecture

- Expo SDK 57, React Native, Expo Router and strict TypeScript.
- Firebase Auth: email/password only; session restoration and explicit logout cleanup.
- Firestore: private profiles, public discovery cards, conversation/group metadata,
  membership, preferences, devices, tasks, polls, invitations and notification jobs.
- Realtime Database: durable messages, presence, typing, collaborative board updates,
  focus sessions and WebRTC signaling; client listeners guarded by server-maintained ACLs.
- Dedicated TypeScript API: validate Firebase ID tokens, enforce canonical membership,
  change capacity transactionally, maintain versioned ACL projections, send FCM/Expo push,
  authorize media, provide AI and manage ephemeral TURN credentials.
- SQLite outbox and native SQLCipher; secure device keys and preferences.
- Peer-to-peer calls with WebRTC; optional TURN deployment for restrictive networks.
- NaCl authenticated encryption for direct conversation device envelopes; native private
  keys stay in SecureStore; verified fingerprints identify registered device keys.
- Provider acceptance, application receipt and conversation opening are separate evidence.

## Verification milestones

1. Firebase core: two real authenticated users exchange messages and manage a group;
   concurrent admission respects capacity; removal revokes reads, writes and push.
2. Collaboration: tasks, polls, threads, shared memory, canvas, attention and focus work
   between clients; persisted state survives reopening.
3. Advanced integrations: AI cites authorized message IDs, real audio transcription,
   encrypted messages decrypt only on intended devices, actual WebRTC media connection.
4. Reliability: offline outbox survives restart; replay preserves idempotency; notification
   policies and quiet hours are exercised; tokens remain private.
5. Delivery: lint, typecheck, meaningful domain/API/rules tests, Expo export/doctor,
   Android build and available runtime checks; document exact iOS and device evidence.
6. Public API and Firebase configuration remain online and reproducible for correction.

## Status

Implementation and verification completed for the academic POC. All assignment requirements
and sixteen additions are implemented. Public Firebase/API integration, security rules, three
browser flows and native Android checks are recorded in [delivery documentation](DELIVERY.md)
and [native evidence](evidence/native-verification.json). The Android APK and iOS simulator
archive are published in v1.0.0. iOS runtime/APNs remain explicitly outside verified coverage
because Apple Developer/iPhone are unavailable; TURN is optional and not provisioned.

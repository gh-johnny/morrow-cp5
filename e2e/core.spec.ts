import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const accounts = JSON.parse(await readFile('.local/fixtures.json', 'utf8')) as { email: string; password: string; uid: string; name: string }[];
const scenario = JSON.parse(await readFile('.local/scenario.json', 'utf8')) as { directId: string; groupId: string; messageId: string };
const firebase = JSON.parse(await readFile('firebaseConfig.json', 'utf8')) as { apiKey: string };
async function resetProtection() {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebase.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: accounts[0].email, password: accounts[0].password, returnSecureToken: true }) });
  const token = await response.json() as { idToken: string };
  const reset = await fetch(`${process.env.E2E_API_URL || 'http://localhost:4000/api'}/conversations/${scenario.directId}/encryption`, { method: 'POST', headers: { Authorization: `Bearer ${token.idToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: false }) });
  expect(reset.ok).toBe(true);
}
test.beforeAll(resetProtection);
test.afterAll(resetProtection);
async function login(page: Page, index: number) {
  await page.goto('/auth'); await page.getByLabel('E-mail', { exact: true }).fill(accounts[index].email); await page.getByLabel('Senha', { exact: true }).fill(accounts[index].password);
  await page.getByRole('button', { name: 'Entrar no Morrow', exact: true }).click(); await expect(page.getByText(`Olá, ${accounts[index].name.split(' ')[0]}.`, { exact: true })).toBeVisible();
}
test('real sessions, realtime chat, durable Blackout recovery and threaded replies', async ({ browser }) => {
  const a = await browser.newContext(); const b = await browser.newContext(); const first = await a.newPage(); const second = await b.newPage();
  await Promise.all([login(first, 0), login(second, 1)]);
  await first.screenshot({ path: 'docs/evidence/conversations-desktop.png', fullPage: true });
  await Promise.all([first.goto(`/chat/${scenario.directId}`), second.goto(`/chat/${scenario.directId}`)]);
  await first.getByRole('button', { name: `Perfil de ${accounts[1].name}`, exact: true }).first().click();
  await expect(first).toHaveURL(new RegExp(`/profile/${accounts[1].uid}$`));
  await expect(first.getByText(accounts[1].email, { exact: true })).toBeVisible();
  await first.goto(`/chat/${scenario.directId}`);
  const unique = `Continuamos juntos ${Date.now()}`; await first.getByRole('textbox', { name: 'Mensagem', exact: true }).fill(unique); await first.getByRole('button', { name: 'Enviar', exact: true }).click(); await expect(second.getByText(unique, { exact: true })).toBeVisible();
  await first.goto('/sync'); await first.getByRole('button', { name: 'Ativar Blackout', exact: true }).click(); await first.goto(`/chat/${scenario.directId}`);
  const queued = `Sobrevive ao reinício ${Date.now()}`; await first.getByRole('textbox', { name: 'Mensagem', exact: true }).fill(queued); await first.getByRole('button', { name: 'Enviar', exact: true }).click(); await expect(first.getByText(queued, { exact: true })).toBeVisible();
  await first.reload(); await expect(first.getByText(queued, { exact: true })).toBeVisible(); await expect(second.getByText(queued, { exact: true })).toHaveCount(0); await first.goto('/sync'); await first.getByRole('button', { name: 'Restaurar sincronização', exact: true }).click(); await expect(second.getByText(queued, { exact: true })).toBeVisible();
  await expect(second.getByText(queued, { exact: true })).toHaveCount(1);
  const actions = second.getByRole('button', { name: 'Ações da mensagem', exact: true }); await actions.last().click(); await second.getByRole('button', { name: 'Abrir tópico', exact: true }).click();
  const reply = `Uma resposta vinculada ${Date.now()}`; await second.getByRole('textbox', { name: 'Mensagem', exact: true }).fill(reply); await second.getByRole('button', { name: 'Enviar', exact: true }).click(); await expect(second.getByText(reply, { exact: true })).toBeVisible();
  await first.goto(`/chat/${scenario.directId}`); await expect(first.getByText(/^1 resposta\(s\)/).last()).toBeVisible();
  await first.screenshot({ path: 'docs/evidence/chat-desktop.png', fullPage: true });
  await a.close(); await b.close();
});
test('tasks, live voting, canvas merging, focus clock and encrypted text across two browsers', async ({ browser }) => {
  const a = await browser.newContext(); const b = await browser.newContext(); const first = await a.newPage(); const second = await b.newPage(); await Promise.all([login(first, 0), login(second, 1)]);
  await first.goto(`/workspace/${scenario.groupId}`); const title = `Tarefa UI ${Date.now()}`; await first.getByLabel('Nova tarefa', { exact: true }).fill(title); await first.getByRole('button', { name: 'Criar tarefa', exact: true }).click(); await expect(first.getByText(title, { exact: true })).toBeVisible();
  await second.goto(`/workspace/${scenario.groupId}`); await expect(second.getByText(title, { exact: true })).toBeVisible();
  await first.getByRole('button', { name: 'Votações', exact: true }).click(); const question = `Decisão UI ${Date.now()}`;
  await first.getByLabel('Pergunta da votação', { exact: true }).fill(question); await first.getByLabel('Opções (uma por linha, 2 a 8)', { exact: true }).fill('Caminho UI A\nCaminho UI B'); await first.getByRole('button', { name: 'Abrir votação', exact: true }).click();
  await second.getByRole('button', { name: 'Votações', exact: true }).click(); await expect(second.getByText(question, { exact: true })).toBeVisible();
  await second.getByRole('button', { name: 'Caminho UI A', exact: true }).first().click(); await expect(first.getByText('1 voto(s)', { exact: true }).first()).toBeVisible();
  await Promise.all([first.goto(`/board/${scenario.groupId}`), second.goto(`/board/${scenario.groupId}`)]); await first.getByRole('button', { name: 'Nova nota', exact: true }).click(); const note = `Nota compartilhada ${Date.now()}`; await first.getByLabel('Texto da nota').last().fill(note); await expect(second.getByLabel('Texto da nota').last()).toHaveValue(note);
  await expect(first.getByText(`${accounts[1].name} no canvas`, { exact: true })).toBeVisible();
  await first.goto(`/chat/${scenario.groupId}`);
  await first.getByRole('button', { name: 'Ver integrantes do grupo', exact: true }).click();
  await expect(first.getByText('Integrantes do grupo', { exact: true })).toBeVisible();
  await first.getByRole('button', { name: `Abrir perfil de ${accounts[1].name}`, exact: true }).click();
  await expect(first.getByText(accounts[1].email, { exact: true })).toBeVisible();
  await first.goto(`/board/${scenario.groupId}`);
  await first.screenshot({ path: 'docs/evidence/canvas-desktop.png', fullPage: true });
  await first.goto(`/focus/${scenario.groupId}`); await first.getByLabel('Objetivo compartilhado').fill(`Concluir UI ${Date.now()}`); await first.getByLabel('Duração em minutos (1 a 120)').fill('2'); await first.getByRole('button', { name: 'Começar um ciclo juntos', exact: true }).click(); await expect(first.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible(); await first.getByRole('button', { name: 'Pausar', exact: true }).click(); await expect(first.getByRole('button', { name: 'Retomar', exact: true })).toBeVisible();
  await second.goto(`/focus/${scenario.groupId}`); await expect(second.getByText('Respirando um pouco', { exact: true })).toBeVisible(); await second.getByRole('button', { name: 'Registrar meu checkpoint', exact: true }).click(); await first.getByRole('button', { name: 'Concluir ciclo', exact: true }).click();
  await first.goto(`/security/${scenario.directId}`); await first.getByRole('button', { name: 'Ativar proteção de texto', exact: true }).click();
  await Promise.all([first.goto(`/chat/${scenario.directId}`), second.goto(`/chat/${scenario.directId}`)]); const protectedText = `Cifrado de verdade ${Date.now()}`; await first.getByRole('textbox', { name: 'Mensagem', exact: true }).fill(protectedText); await first.getByRole('button', { name: 'Enviar', exact: true }).click(); await expect(second.getByText(protectedText, { exact: true })).toBeVisible();
  await first.goto(`/security/${scenario.directId}`); await first.getByRole('button', { name: 'Desativar proteção de texto', exact: true }).click(); await a.close(); await b.close();
});
test('actual WebRTC connection exchanges video tracks', async ({ browser }) => {
  const options = { permissions: ['camera', 'microphone'] }; const a = await browser.newContext(options); const b = await browser.newContext(options); const first = await a.newPage(); const second = await b.newPage(); await Promise.all([login(first, 0), login(second, 1)]);
  await Promise.all([first.goto(`/call/${scenario.directId}`), second.goto(`/call/${scenario.directId}`)]); await Promise.all([first.getByRole('button', { name: 'Entrar na sala', exact: true }).click(), second.getByRole('button', { name: 'Entrar na sala', exact: true }).click()]);
  await expect(first.getByText(`${accounts[1].name} · connected`, { exact: true })).toBeVisible({ timeout: 45_000 }); await expect(second.getByText(`${accounts[0].name} · connected`, { exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(first.locator('video')).toHaveCount(2); await first.screenshot({ path: 'docs/evidence/webrtc-desktop.png', fullPage: true }); await first.getByRole('button', { name: 'Sair da chamada', exact: true }).click(); await second.getByRole('button', { name: 'Sair da chamada', exact: true }).click(); await a.close(); await b.close();
});

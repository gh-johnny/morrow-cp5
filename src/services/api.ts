import { ZodError, type ZodType } from 'zod';
import { Platform } from 'react-native';
import { auth } from './firebase';

export const apiBase = process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'web' && typeof location !== 'undefined'
  ? `${location.origin}/api` : 'https://morrow-cp5.vercel.app/api');
export class RequestError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); }
}

export async function api<T>(path: string, schema: ZodType<T>, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new RequestError('Entre na sua conta para continuar.', 401, 'UNAUTHENTICATED');
  const token = await user.getIdToken();
  const response = await fetch(`${apiBase}${path}`, {
    method: options.method || 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}), signal: options.signal ?? AbortSignal.timeout(55_000),
  });
  const value: unknown = await response.json();
  if (!response.ok) {
    const body = value && typeof value === 'object' ? value as { error?: unknown; code?: unknown } : {};
    throw new RequestError(typeof body.error === 'string' ? body.error : 'Não foi possível concluir. Tente novamente.', response.status,
      typeof body.code === 'string' ? body.code : 'REQUEST_FAILED');
  }
  return schema.parse(value);
}

export function friendlyError(error: unknown): string {
  if (error instanceof RequestError) return error.message;
  if (error instanceof ZodError) {
    const field = String(error.issues[0]?.path[0] ?? '');
    return ({ name: 'Informe seu nome completo.', phoneNumber: 'Confira o celular com código do país.', birthDate: 'Confira sua data de nascimento.', photoUrl: 'Selecione uma foto de perfil.', title: 'Preencha o título.', text: 'Confira o texto da mensagem.' } as Record<string, string>)[field] ?? 'Confira os campos preenchidos e tente novamente.';
  }
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found'].includes(code)) return 'E-mail ou senha incorretos.';
  if (code === 'auth/email-already-in-use') return 'Este e-mail já possui uma conta. Entre ou recupere sua senha.';
  if (code === 'auth/weak-password') return 'Use uma senha com pelo menos 8 caracteres.';
  if (code === 'auth/invalid-email') return 'Confira o endereço de e-mail.';
  if (code === 'auth/network-request-failed' || error instanceof TypeError) return 'Sem conexão. Sua alteração permanece na fila quando aplicável.';
  if (code === 'permission-denied' || code === 'PERMISSION_DENIED') return 'Você não possui acesso a estes dados.';
  return error instanceof Error ? error.message : 'Não foi possível concluir. Tente novamente.';
}

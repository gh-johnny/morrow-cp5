import { useState } from 'react';
import { Image, View, useWindowDimensions } from 'react-native';
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { ArrowRight, Camera, Check, KeyRound } from 'lucide-react-native';
import { auth } from '../services/firebase';
import { api, friendlyError } from '../services/api';
import { pickPhoto, uploadFile, type SelectedFile } from '../services/media';
import { profileInputSchema, profileSchema } from '../../shared/contracts';
import { useSession } from '../providers/session';
import { Button, Card, Chip, Copy, Eyebrow, Field, Kite, Row, Screen, Title } from '../ui/kit';
import { usePalette } from '../ui/theme';
export default function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('');
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [birth, setBirth] = useState('');
  const [photo, setPhoto] = useState<SelectedFile | null>(null); const [error, setError] = useState<string | null>(null); const [success, setSuccess] = useState<string | null>(null);
  const session = useSession(); const colors = usePalette(); const { width } = useWindowDimensions();
  const finishing = Boolean(session.user && !session.profile); const signup = mode === 'signup' || finishing;
  async function submit() {
    setError(null); setSuccess(null);
    try {
      if (mode === 'reset' && !finishing) { await sendPasswordResetEmail(auth, email.trim()); setSuccess('Se existir uma conta para este e-mail, você receberá as instruções.'); return; }
      if (!signup) { await signInWithEmailAndPassword(auth, email.trim(), password); return; }
      if (!finishing && (password.length < 8 || password !== confirm)) throw new Error('Use uma senha de pelo menos 8 caracteres e confirme a mesma senha.');
      if (!photo) throw new Error('Selecione sua foto de perfil para continuar.');
      const date = birth.includes('/') ? birth.split('/').reverse().join('-') : birth;
      profileInputSchema.omit({ photoUrl: true }).parse({ name, phoneNumber: `+${phone.replace(/\D/g, '')}`, birthDate: date });
      const user = session.user ?? (await createUserWithEmailAndPassword(auth, email.trim(), password)).user;
      const attachment = await uploadFile(photo, 'profile');
      await api('/users/me', profileSchema, { method: 'PUT', body: { name, phoneNumber: `+${phone.replace(/\D/g, '')}`, birthDate: date, photoUrl: attachment.url } });
      await updateProfile(user, { displayName: name }); await session.refresh();
    } catch (error) { setError(friendlyError(error)); }
  }
  return <Screen title="Dê espaço ao próximo passo." eyebrow="MORROW / CONVERSAR. CONSTRUIR. CONTINUAR." subtitle="Um lugar para conectar sua equipe e transformar boas conversas em algo concreto."><View style={{ flexDirection: width > 900 ? 'row' : 'column', gap: 24, paddingTop: 6, maxWidth: 1100, alignSelf: 'center', width: '100%' }}>
    {width > 700 ? <Card style={{ flex: 1, minHeight: 480, padding: 32, justifyContent: 'space-between', backgroundColor: colors.elevated }}><Eyebrow>MENOS RUÍDO. MAIS MOVIMENTO.</Eyebrow><View style={{ alignItems: 'center', padding: 24 }}><Kite size={185} happy /></View><View style={{ gap: 15 }}><Title size={32}>O amanhã começa{'\n'}numa conversa.</Title><Copy muted>Chat ao vivo. Memórias compartilhadas. Foco em equipe. Kite acompanha o caminho.</Copy><Row><Chip label="Firebase em tempo real" /><Chip label="Seu espaço, suas escolhas" /></Row></View></Card> : null}
    <Card style={{ flex: 1, maxWidth: 500, padding: width > 700 ? 32 : 22 }}><Row style={{ justifyContent: 'space-between' }}><Title size={24}>{finishing ? 'Seu perfil, primeiro.' : mode === 'reset' ? 'Recuperar acesso' : signup ? 'Faça parte.' : 'Bom te ver por aqui.'}</Title><Kite size={38} /></Row><Copy muted>{finishing ? 'Sua conta foi criada. Complete os dados para abrir seu espaço.' : mode === 'reset' ? 'Vamos enviar as instruções para o seu e-mail.' : 'Entre com seu e-mail e senha.'}</Copy>
    {!finishing ? <Row><Chip label="Entrar" selected={mode === 'login'} onPress={() => { setMode('login'); setError(null); }} /><Chip label="Criar conta" selected={mode === 'signup'} onPress={() => { setMode('signup'); setError(null); }} /></Row> : null}
    {signup ? <><Button secondary icon={Camera} label={photo ? 'Trocar foto' : 'Selecionar foto de perfil'} onPress={async () => { const selected = await pickPhoto(); if (selected) setPhoto(selected); }} />{photo ? <Image source={{ uri: photo.uri }} style={{ width: 76, height: 76, borderRadius: 22, alignSelf: 'center' }} /> : null}<Field label="Nome completo" value={name} onChangeText={setName} autoComplete="name" /><Field label="Celular com país (ex.: +5511999999999)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" /><Field label="Nascimento (DD/MM/AAAA)" value={birth} onChangeText={setBirth} placeholder="15/03/2003" /></> : null}
    {!finishing ? <Field label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" /> : null}{!finishing && mode !== 'reset' ? <Field label="Senha" value={password} onChangeText={setPassword} secureTextEntry autoComplete={signup ? 'new-password' : 'current-password'} /> : null}{signup && !finishing ? <Field label="Confirmar senha" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" /> : null}
    {(error ?? session.error) ? <Copy>{error ?? session.error}</Copy> : null}{success ? <Copy>{success}</Copy> : null}<Button icon={signup ? Check : ArrowRight} label={signup ? 'Abrir meu espaço' : mode === 'reset' ? 'Enviar instruções' : 'Entrar no Morrow'} onPress={submit} />
    {!finishing ? <Button secondary compact icon={KeyRound} label={mode === 'reset' ? 'Voltar para entrar' : 'Esqueci minha senha'} onPress={() => setMode(mode === 'reset' ? 'login' : 'reset')} /> : <Button secondary label="Sair desta conta" onPress={session.logout} />}<Copy muted small>Seus dados completos ficam privados. Outras pessoas veem nome e foto; o perfil completo exige uma conversa em comum.</Copy>
    </Card></View></Screen>;
}

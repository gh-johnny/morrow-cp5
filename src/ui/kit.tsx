import { useState, useEffect, type PropsWithChildren, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { router, usePathname, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowUpRight, Bell, Compass, FlaskConical, MessageCircle, Plus, UserRound, type LucideIcon } from 'lucide-react-native';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';
import { fonts, usePalette } from './theme';
import { friendlyError } from '../services/api';
import { signedMediaUrl } from '../services/media';
import { notify, useRuntime } from '../store/runtime';
import { useSession } from '../providers/session';

export function Copy({ children, muted, small, style }: PropsWithChildren<{ muted?: boolean; small?: boolean; style?: TextStyle }>) {
  const colors = usePalette();
  return <Text style={[{ fontFamily: fonts.body, fontSize: small ? 12 : 14, lineHeight: small ? 19 : 23, color: muted ? colors.muted : colors.text }, style]}>{children}</Text>;
}
export function Title({ children, size = 30 }: PropsWithChildren<{ size?: number }>) {
  const colors = usePalette();
  return <Text style={{ fontFamily: fonts.heading, fontSize: size, letterSpacing: -0.8, color: colors.text }}>{children}</Text>;
}
export function Eyebrow({ children }: PropsWithChildren) { const colors = usePalette(); return <Text style={{ fontFamily: fonts.bold, fontSize: 10, letterSpacing: 2, color: colors.secondary }}>{children}</Text>; }
export function Row({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) { return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 12 }, style]}>{children}</View>; }
export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) { const colors = usePalette(); return <View style={[{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 20, gap: 12 }, style]}>{children}</View>; }
export function Button({ label, icon: Icon, onPress, secondary, danger, disabled, compact }: { label: string; icon?: LucideIcon; onPress: () => void | Promise<unknown>; secondary?: boolean; danger?: boolean; disabled?: boolean; compact?: boolean }) {
  const colors = usePalette(); const [busy, setBusy] = useState(false);
  const color = danger ? colors.danger : secondary ? colors.text : colors.accentText;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled || busy} onPress={() => {
    setBusy(true); Promise.resolve().then(onPress).catch((error) => notify(friendlyError(error))).finally(() => setBusy(false));
  }} style={({ pressed }) => ({ backgroundColor: secondary || danger ? colors.elevated : colors.accent, opacity: disabled || busy ? 0.5 : pressed ? 0.75 : 1,
    paddingVertical: compact ? 9 : 14, paddingHorizontal: compact ? 14 : 18, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: compact ? 38 : 49 })}>
    {busy ? <ActivityIndicator size="small" color={color} /> : Icon ? <Icon size={compact ? 16 : 18} color={color} /> : null}
    <Text style={{ fontFamily: fonts.bold, fontSize: compact ? 12 : 13, color }}>{label}</Text>
  </Pressable>;
}
export function IconButton({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void | Promise<unknown> }) {
  const colors = usePalette(); return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => { Promise.resolve().then(onPress).catch((error) => notify(friendlyError(error))); }} style={{ width: 42, height: 42, backgroundColor: colors.elevated, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}><Icon size={19} color={colors.text} /></Pressable>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const colors = usePalette(); return <View style={{ gap: 7 }}><Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.muted }}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} {...props} style={[{ fontFamily: fonts.body, fontSize: 14, color: colors.text, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, minHeight: 48 }, props.style]} /></View>;
}
export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void | Promise<unknown> }) {
  const colors = usePalette(); return <Pressable accessibilityRole={onPress ? 'button' : 'text'} onPress={onPress ? () => { Promise.resolve().then(onPress).catch((error) => notify(friendlyError(error))); } : undefined} style={{ paddingHorizontal: 13, paddingVertical: 8, borderWidth: 1, borderColor: selected ? colors.accent : colors.border, borderRadius: 99, backgroundColor: selected ? colors.accent : colors.surface }}><Text style={{ fontFamily: fonts.medium, fontSize: 11, color: selected ? colors.accentText : colors.muted }}>{label}</Text></Pressable>;
}
export function State({ loading, error, title, detail }: { loading?: boolean; error?: string | null; title?: string; detail?: string }) {
  const colors = usePalette(); return <View style={{ padding: 30, gap: 12, alignItems: 'center' }}>{loading ? <ActivityIndicator color={colors.accent} /> : <Kite size={72} />}<Title size={20}>{error ? 'Precisamos de um instante' : title ?? 'Carregando'}</Title><Copy muted>{error ?? detail}</Copy></View>;
}
export function Kite({ size = 56, happy = false }: { size?: number; happy?: boolean }) {
  const colors = usePalette(); return <Svg width={size} height={size} viewBox="0 0 100 100"><Polygon points="50,4 92,38 76,88 29,94 8,43" fill={colors.accent} /><Polygon points="50,4 50,62 8,43" fill={colors.secondary} opacity="0.55" /><Path d="M32 88L38 100M66 91L61 100" stroke={colors.text} strokeWidth={3} /><Circle cx={40} cy={46} r={4} fill={colors.accentText} /><Circle cx={65} cy={43} r={4} fill={colors.accentText} /><Path d={happy ? 'M43 61Q53 73 66 58' : 'M46 63L60 61'} stroke={colors.accentText} strokeWidth={3} strokeLinecap="round" fill="none" /></Svg>;
}
export function useSignedMedia(url?: string) {
  const [signed, setSigned] = useState<{ source: string; url: string } | null>(null);
  useEffect(() => { let active = true; if (!url) return; const load = () => { void signedMediaUrl(url).then((next) => { if (active) setSigned({ source: url, url: next }); }).catch(() => undefined); }; load(); const interval = setInterval(load, 240_000); return () => { active = false; clearInterval(interval); }; }, [url]);
  return signed && signed.source === url ? signed.url : null;
}
export function Avatar({ name = '?', url, size = 48, onPress, label }: { name?: string; url?: string; size?: number; onPress?: () => void; label?: string }) {
  const colors = usePalette(); const signed = useSignedMedia(url);
  return <Pressable onPress={onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={label ?? `Perfil de ${name}`} disabled={!onPress} style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: colors.elevated, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>{signed ? <Image source={{ uri: signed }} style={{ width: size, height: size }} /> : <Text style={{ fontFamily: fonts.heading, color: colors.secondary, fontSize: size * 0.35 }}>{name.slice(0, 2).toUpperCase()}</Text>}</Pressable>;
}
const navigation: { path: Href; label: string; icon: LucideIcon }[] = [{ path: '/', label: 'Conversas', icon: MessageCircle }, { path: '/attention', label: 'Atenção', icon: Bell }, { path: '/radar', label: 'Radar', icon: Compass }, { path: '/profile', label: 'Meu espaço', icon: UserRound }];
export function Screen({ children, title, eyebrow, subtitle, action, back, scroll = true, tabs = false }: PropsWithChildren<{ title: string; eyebrow?: string; subtitle?: string; action?: ReactNode; back?: boolean; scroll?: boolean; tabs?: boolean }>) {
  const colors = usePalette(); const { width } = useWindowDimensions(); const wide = width >= 1000; const path = usePathname(); const { profile } = useSession();
  const pending = useRuntime((state) => state.pending); const online = useRuntime((state) => state.online); const blackout = useRuntime((state) => state.blackout);
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}><Row style={{ flex: 1, gap: 0, alignItems: 'stretch' }}>
    {wide && profile ? <View style={{ width: 240, borderRightWidth: 1, borderColor: colors.border, padding: 26, gap: 32 }}><Row><Kite size={34} /><Title size={25}>morrow.</Title></Row><Copy muted small>Conversas que viram movimento.</Copy><View style={{ gap: 12 }}>{navigation.map((item) => <Pressable key={String(item.path)} onPress={() => router.push(item.path)} style={{ backgroundColor: path === item.path ? colors.elevated : 'transparent', padding: 14, borderRadius: 12 }}><Row><item.icon size={18} color={path === item.path ? colors.accent : colors.muted} /><Copy>{item.label}</Copy></Row></Pressable>)}</View><Button label="Nova conversa" icon={Plus} onPress={() => router.push('/people')} /><View style={{ flex: 1 }} /><Button secondary label="Blackout Lab" icon={FlaskConical} onPress={() => router.push('/sync')} /><Row><Avatar name={profile.name} url={profile.photoUrl} size={34} /><Copy small>{profile.name.split(' ')[0]}</Copy></Row></View> : null}
    <View style={{ flex: 1, minWidth: 0 }}><View style={{ paddingHorizontal: wide ? 40 : 22, paddingTop: 22, paddingBottom: 20, gap: 14 }}><Row style={{ justifyContent: 'space-between' }}><Row>{back ? <IconButton icon={ArrowLeft} label="Voltar" onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }} /> : !wide ? <Kite size={30} /> : null}<Eyebrow>{eyebrow ?? 'MORROW / SEU PRÓXIMO PASSO'}</Eyebrow></Row>{action}</Row><Title size={wide ? 38 : 30}>{title}</Title>{subtitle ? <Copy muted>{subtitle}</Copy> : null}</View>
    {(!online || blackout || pending > 0) ? <Pressable onPress={() => router.push('/sync')} style={{ marginHorizontal: 22, marginBottom: 14, backgroundColor: colors.elevated, padding: 12, borderRadius: 12 }}><Row><FlaskConical size={16} color={colors.accent} /><Copy small>{blackout ? 'Blackout ativo' : !online ? 'Sem conexão' : 'Sincronizando'} · {pending} na fila</Copy><ArrowUpRight size={14} color={colors.muted} /></Row></Pressable> : null}
    {scroll ? <ScrollView contentContainerStyle={{ paddingHorizontal: wide ? 40 : 22, paddingBottom: 32, gap: 20, flexGrow: 1 }} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={{ flex: 1, minHeight: 0, paddingHorizontal: wide ? 40 : 16 }}>{children}</View>}
    {tabs && !wide ? <Row style={{ paddingTop: 12, paddingBottom: 8, borderTopWidth: 1, borderColor: colors.border, justifyContent: 'space-around' }}>{navigation.map((item) => <Pressable key={String(item.path)} accessibilityRole="button" accessibilityLabel={item.label} onPress={() => router.push(item.path)} style={{ alignItems: 'center', gap: 5 }}><item.icon size={21} color={path === item.path ? colors.accent : colors.muted} /><Copy small muted={path !== item.path}>{item.label}</Copy></Pressable>)}</Row> : null}
    </View></Row></SafeAreaView>;
}
export function Toast() { const message = useRuntime((state) => state.toast); const colors = usePalette(); return message ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', alignItems: 'center', padding: 30, paddingBottom: 95 }]}><View style={{ backgroundColor: colors.accent, padding: 18, borderRadius: 14, maxWidth: 520 }}><Text style={{ color: colors.accentText, fontFamily: fonts.medium, fontSize: 13 }}>{message}</Text></View></View> : null; }

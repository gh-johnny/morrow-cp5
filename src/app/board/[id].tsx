import { useMemo, useRef, useState } from 'react';
import { PanResponder, ScrollView, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { Pencil, Plus, Trash2 } from 'lucide-react-native';
import type { BoardNote } from '../../../shared/contracts';
import { useBoard } from '../../hooks/board';
import { useConversation, usePeople } from '../../hooks/data';
import { useBoardPresence } from '../../hooks/board-presence';
import { useSession } from '../../providers/session';
import { Button, Card, Chip, Copy, IconButton, Row, Screen, State, Title } from '../../ui/kit';
import { fonts, usePalette } from '../../ui/theme';
export default function BoardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { conversation, error } = useConversation(id); const board = useBoard(conversation ? id : null); const colors = usePalette(); const [drawing, setDrawing] = useState(false); const [points, setPoints] = useState<{ x: number; y: number }[]>([]); const draft = useRef<{ x: number; y: number }[]>([]);
  const { addStroke } = board; const presence = useBoardPresence(conversation ? id : null); const people = usePeople(); const { user } = useSession(); const movePointer = presence.move;
  // PanResponder retains these callbacks; it never reads their refs during render.
  // eslint-disable-next-line react-hooks/refs
  const responder = useMemo(() => PanResponder.create({ onStartShouldSetPanResponder: () => drawing, onMoveShouldSetPanResponder: () => drawing,
    onPanResponderGrant: (event) => { movePointer(event.nativeEvent.locationX, event.nativeEvent.locationY); draft.current = [{ x: event.nativeEvent.locationX, y: event.nativeEvent.locationY }]; setPoints([...draft.current]); },
    onPanResponderMove: (event) => { movePointer(event.nativeEvent.locationX, event.nativeEvent.locationY); if (draft.current.length < 500) { draft.current.push({ x: event.nativeEvent.locationX, y: event.nativeEvent.locationY }); setPoints([...draft.current]); } },
    onPanResponderRelease: () => { addStroke(draft.current, colors.secondary); draft.current = []; setPoints([]); }, onPanResponderTerminate: () => setPoints([]),
  }), [drawing, addStroke, colors.secondary, movePointer]);
  const path = (values: { x: number; y: number }[]) => values.map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`).join(' ');
  if (!conversation) return <Screen title="Canvas compartilhado" back><State loading={!error} error={error} /></Screen>;
  return <Screen title="Dê forma às ideias." back eyebrow={`CANVAS / ${conversation.name || 'SUA CONVERSA'}`} subtitle="Notas e traços compartilhados. Alterações simultâneas são combinadas por um documento Yjs."><Row style={{ flexWrap: 'wrap' }}><Button label="Nova nota" icon={Plus} onPress={() => board.addNote('Uma nova ideia…')} /><Button secondary icon={Pencil} label={drawing ? 'Concluir desenho' : 'Desenhar'} onPress={() => setDrawing(!drawing)} /><Chip label={board.pending ? `${board.pending} alteração(ões) na fila` : 'Sincronizado'} /></Row><Row style={{ flexWrap: 'wrap' }}>{presence.cursors.map((cursor) => <Chip key={cursor.uid} label={cursor.uid === user?.uid ? 'Você está no canvas' : `${people.byId[cursor.uid]?.name ?? 'Integrante'} no canvas`} />)}</Row>{board.error ? <Copy>{board.error}</Copy> : null}<ScrollView horizontal><View {...responder.panHandlers} onTouchStart={(event) => presence.move(event.nativeEvent.locationX, event.nativeEvent.locationY)} onTouchMove={(event) => presence.move(event.nativeEvent.locationX, event.nativeEvent.locationY)} style={{ width: 900, height: Math.max(640, ...board.notes.map((note) => note.y + 180)), backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 20, overflow: 'hidden' }}><Svg width="100%" height="100%" style={{ position: 'absolute' }}>{Array.from({ length: 30 }, (_, index) => <Path key={index} d={`M${index * 30} 0V1200 M0 ${index * 30}H900`} stroke={colors.border} strokeWidth={0.5} opacity={0.4} />)}{board.strokes.map((stroke) => <Path key={stroke.id} d={path(stroke.points)} stroke={stroke.color} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />)}<Path d={path(points)} stroke={colors.secondary} strokeWidth={3} fill="none" /></Svg>{board.notes.map((note) => <Sticky key={note.id} note={note} disabled={drawing} update={board.updateNote} remove={board.removeNote} />)}{presence.cursors.filter((cursor) => cursor.uid !== user?.uid).map((cursor) => <View key={cursor.uid} pointerEvents="none" style={{ position: 'absolute', left: cursor.x, top: cursor.y, padding: 5, borderRadius: 6, backgroundColor: colors.secondary }}><Copy small style={{ color: colors.background }}>↖ {people.byId[cursor.uid]?.name.split(' ')[0] ?? 'Integrante'}</Copy></View>)}</View></ScrollView><Card><Title size={19}>Um espaço feito por vocês.</Title><Copy muted small>Arraste pela alça da nota para reposicionar. Edite o texto direto no canvas. Cada campo da nota possui estado compartilhado; o desenho aparece para a equipe ao concluir o traço.</Copy></Card></Screen>;
}
function Sticky({ note, disabled, update, remove }: { note: BoardNote; disabled: boolean; update: (id: string, value: Partial<BoardNote>) => void; remove: (id: string) => void }) {
  const initial = useRef({ x: note.x, y: note.y });
  // The ref is touched only by gesture callbacks, after PanResponder creation.
  // eslint-disable-next-line react-hooks/refs
  const pan = useMemo(() => PanResponder.create({ onStartShouldSetPanResponder: () => !disabled, onPanResponderGrant: () => { initial.current = { x: note.x, y: note.y }; }, onPanResponderMove: (_event, gesture) => update(note.id, { x: Math.min(705, Math.max(0, initial.current.x + gesture.dx)), y: Math.max(0, initial.current.y + gesture.dy) }) }), [disabled, note.id, note.x, note.y, update]);
  return <View pointerEvents={disabled ? 'none' : 'auto'} style={{ position: 'absolute', left: note.x, top: note.y, width: 185, minHeight: 130, borderRadius: 9, backgroundColor: note.color, padding: 12, gap: 9 }}><View {...pan.panHandlers}><Row style={{ justifyContent: 'space-between' }}><Copy small style={{ color: '#17200F' }}>⠿ mover</Copy><IconButton icon={Trash2} label="Remover nota" onPress={() => remove(note.id)} /></Row></View><TextInput accessibilityLabel="Texto da nota" value={note.text} multiline onChangeText={(text) => update(note.id, { text: text.slice(0, 2000) })} style={{ color: '#17200F', fontFamily: fonts.medium, fontSize: 14, minHeight: 70 }} /></View>;
}

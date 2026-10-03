import { useState } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { QrCode } from 'lucide-react-native';
import { Button, Card, Copy, Field, Screen, Title } from '../ui/kit';
import { notify } from '../store/runtime';

export default function JoinScreen() {
  const [link, setLink] = useState(''); const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  function open(value: string) {
    const token = value.trim().match(/(?:\/invite\/|^)([A-Za-z0-9_-]{16,160})\/?(?:\?.*)?$/)?.[1];
    if (!token) throw new Error('Cole um convite Morrow ou leia o QR do grupo.');
    setScanning(false); router.replace({ pathname: '/invite/[token]', params: { token } });
  }
  return <Screen title="Encontre seu próximo grupo." back eyebrow="CONVITES / PORTAS ABERTAS"><Card><Title size={22}>Recebeu um convite?</Title><Copy muted>O convite informa a equipe, vagas disponíveis e se a entrada precisa de aprovação.</Copy><Field label="Link ou código do convite" value={link} onChangeText={setLink} autoCapitalize="none" /><Button label="Abrir convite" onPress={() => open(link)} />{Platform.OS !== 'web' ? <Button secondary icon={QrCode} label="Ler QR do grupo" onPress={async () => { const access = permission?.granted ? permission : await requestPermission(); if (!access.granted) throw new Error('Permita a câmera para ler o convite.'); setScanning(true); }} /> : null}{scanning ? <><CameraView style={{ height: 300, borderRadius: 16 }} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={(event) => { try { open(event.data); } catch (error) { setScanning(false); notify(error instanceof Error ? error.message : 'Convite inválido.'); } }} /><Button secondary label="Fechar câmera" onPress={() => setScanning(false)} /></> : null}</Card></Screen>;
}

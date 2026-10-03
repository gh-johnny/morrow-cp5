import { useRuntime } from '../store/runtime';
export const dark = { background: '#111714', surface: '#1A231E', elevated: '#253027', border: '#344237', text: '#F1F3E8', muted: '#A2B0A5', accent: '#DBF581', accentText: '#17200F', secondary: '#A8CBC2', danger: '#FFB3A1' };
export const light = { background: '#F2F1E8', surface: '#FCFCF6', elevated: '#E5E8DB', border: '#CCD3C5', text: '#1A261D', muted: '#607362', accent: '#CFEB73', accentText: '#17200F', secondary: '#366D61', danger: '#AD442B' };
export type Palette = typeof dark;
export function usePalette(): Palette { return useRuntime((state) => state.theme) === 'light' ? light : dark; }
export const fonts = { heading: 'SpaceGrotesk_600SemiBold', body: 'Manrope_400Regular', medium: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' };

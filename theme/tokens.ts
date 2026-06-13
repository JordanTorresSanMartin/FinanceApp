import type { TextStyle } from 'react-native';

/**
 * Tokens ESTÁTICOS de Material Design 3 (no dependen del color dinámico).
 * Separados del color porque el color sí cambia con Dynamic Color / wallpaper,
 * pero la escala tipográfica, las formas y el ritmo espacial son constantes.
 */

// ── Shape scale (MD3) ────────────────────────────────────────────────────────
// "Expressive" usa esquinas grandes y orgánicas: cards 28, FAB/diálogos 28,
// chips y botones totalmente redondeados (full).
export const shape = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 28,        // cards grandes, hojas inferiores, diálogos
  full: 999,     // botones, chips, FAB, avatares
} as const;

// ── Spacing (grilla de 4 dp) ─────────────────────────────────────────────────
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

// ── Type scale (MD3) ─────────────────────────────────────────────────────────
// Cada rol define tamaño/interlineado/peso/tracking exactos de la spec MD3.
// El gran contraste display↔label es lo que da la personalidad "Expressive":
// usamos `display*` para cifras héroe (balance) y `label*` para metadatos.
const t = (
  fontSize: number,
  lineHeight: number,
  fontWeight: TextStyle['fontWeight'],
  letterSpacing: number,
): TextStyle => ({ fontSize, lineHeight, fontWeight, letterSpacing });

export const typescale = {
  displayLarge:  t(57, 64, '400', -0.25),
  displayMedium: t(45, 52, '400', 0),
  displaySmall:  t(36, 44, '400', 0),

  headlineLarge:  t(32, 40, '400', 0),
  headlineMedium: t(28, 36, '400', 0),
  headlineSmall:  t(24, 32, '400', 0),

  titleLarge:  t(22, 28, '500', 0),
  titleMedium: t(16, 24, '500', 0.15),
  titleSmall:  t(14, 20, '500', 0.1),

  bodyLarge:  t(16, 24, '400', 0.5),
  bodyMedium: t(14, 20, '400', 0.25),
  bodySmall:  t(12, 16, '400', 0.4),

  labelLarge:  t(14, 20, '500', 0.1),
  labelMedium: t(12, 16, '500', 0.5),
  labelSmall:  t(11, 16, '500', 0.5),

  // Variante Expressive: cifra héroe del balance (más peso del que da MD3 base).
  displayHero: t(48, 52, '700', -0.5),
} as const;

// ── Motion (duraciones y easing MD3) ─────────────────────────────────────────
export const motion = {
  duration: { short: 150, medium: 250, long: 400 },
  // easing "emphasized" de MD3 para micro-animaciones expresivas
  easingEmphasized: [0.2, 0.0, 0.0, 1.0] as const,
} as const;

// ── Elevación por COLOR (MD3) ────────────────────────────────────────────────
// En MD3 la jerarquía se expresa subiendo el contenedor de superficie, no con
// sombras densas. Mapeamos "niveles" a las llaves de surfaceContainer* del
// esquema dinámico (resueltas en ThemeProvider).
export const elevationSurface = {
  0: 'surface',
  1: 'surfaceContainerLow',
  2: 'surfaceContainer',
  3: 'surfaceContainerHigh',
  4: 'surfaceContainerHighest',
} as const;

// Color semilla de respaldo: se usa para generar la paleta MD3 en iOS y en
// Android < 12, donde NO hay Dynamic Color del wallpaper. Mantiene la identidad
// azul de la marca.
export const FALLBACK_SOURCE_COLOR = '#2563EB';

export type Shape = typeof shape;
export type Spacing = typeof spacing;
export type Typescale = typeof typescale;

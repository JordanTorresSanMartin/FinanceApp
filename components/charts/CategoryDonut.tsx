import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { useAppTheme } from '@/theme';

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

interface CategoryDonutProps {
  data: DonutSegment[];
  size?: number;
  /** Grosor del anillo. */
  thickness?: number;
  selectedKey?: string | null;
  onSelect?: (key: string | null) => void;
  centerPrimary?: string;
  centerSecondary?: string;
}

// Punto en la circunferencia con 0 = arriba y sentido horario.
function polar(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.sin(angle), y: cy - r * Math.cos(angle) };
}

// Path de un sector anular (donut slice) entre dos ángulos.
function annularPath(cx: number, cy: number, ri: number, ro: number, a0: number, a1: number) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const oS = polar(cx, cy, ro, a0);
  const oE = polar(cx, cy, ro, a1);
  const iE = polar(cx, cy, ri, a1);
  const iS = polar(cx, cy, ri, a0);
  return `M ${oS.x} ${oS.y} A ${ro} ${ro} 0 ${large} 1 ${oE.x} ${oE.y} L ${iE.x} ${iE.y} A ${ri} ${ri} 0 ${large} 0 ${iS.x} ${iS.y} Z`;
}

export function CategoryDonut({
  data,
  size = 240,
  thickness = 38,
  selectedKey = null,
  onSelect,
  centerPrimary,
  centerSecondary,
}: CategoryDonutProps) {
  const t = useAppTheme();
  const c = t.colors;

  const total = data.reduce((s, d) => s + d.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const ro = size / 2;
  const ri = ro - thickness;
  const pop = 10; // cuánto "sale" el sector seleccionado
  const pad = data.length > 1 ? 0.025 : 0; // separación entre sectores (rad)

  const press = (key: string) => {
    Haptics.selectionAsync();
    onSelect?.(selectedKey === key ? null : key);
  };

  // Estado vacío
  if (total <= 0) {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size}>
          <Circle cx={cx} cy={cy} r={(ri + ro) / 2} stroke={c.surfaceVariant} strokeWidth={thickness} fill="none" />
        </Svg>
        <View style={styles.center} pointerEvents="none">
          <Text style={[t.type.bodyMedium, { color: c.onSurfaceVariant }]}>Sin gastos</Text>
        </View>
      </View>
    );
  }

  let acc = 0;
  const slices = data.map(seg => {
    const frac = seg.value / total;
    const a0 = acc * 2 * Math.PI + pad / 2;
    const a1 = (acc + frac) * 2 * Math.PI - pad / 2;
    acc += frac;
    const selected = selectedKey === seg.key;
    const dim = selectedKey != null && !selected;
    return { seg, a0: Math.min(a0, a1), a1: Math.max(a0, a1), selected, dim };
  });

  const single = data.length === 1;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <G>
          {single ? (
            <Circle
              cx={cx}
              cy={cy}
              r={(ri + ro) / 2}
              stroke={data[0].color}
              strokeWidth={thickness}
              fill="none"
              onPress={() => press(data[0].key)}
            />
          ) : (
            slices.map(({ seg, a0, a1, selected, dim }) => (
              <Path
                key={seg.key}
                d={annularPath(cx, cy, ri, selected ? ro + pop : ro, a0, a1)}
                fill={seg.color}
                opacity={dim ? 0.4 : 1}
                onPress={() => press(seg.key)}
              />
            ))
          )}
        </G>
      </Svg>

      {/* Centro */}
      <View style={styles.center} pointerEvents="none">
        {!!centerSecondary && (
          <Text style={[t.type.labelMedium, { color: c.onSurfaceVariant }]} numberOfLines={1}>
            {centerSecondary}
          </Text>
        )}
        {!!centerPrimary && (
          <Text style={[t.type.headlineSmall, { color: c.onSurface, fontWeight: '700' }]} numberOfLines={1}>
            {centerPrimary}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
});

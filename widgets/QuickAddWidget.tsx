import React from 'react';
import { ColorProp, FlexWidget, TextWidget } from 'react-native-android-widget';

/**
 * Paleta tomada de la app (constants/theme.ts + app/transaction/new.tsx)
 * para que el widget se sienta parte del mismo producto.
 */
const COLORS = {
  card: '#FFFFFF',
  cardBorder: '#E5E5EA',
  text: '#1C1C1E',
  text2: '#6C6C70',
  green: '#34C759',
  greenSoft: '#E8F8EC',
  red: '#FF3B30',
  redSoft: '#FFECEB',
  blue: '#007AFF',
  blueSoft: '#EAF2FF',
} as const;

interface ActionButtonProps {
  label: string;
  glyph: string;        // símbolo unicode (evita dependencias de fuentes de íconos)
  color: ColorProp;
  softColor: ColorProp;
  clickAction: string;
}

function ActionButton({ label, glyph, color, softColor, clickAction }: ActionButtonProps) {
  return (
    <FlexWidget
      clickAction={clickAction}
      style={{
        flex: 1,
        height: 56,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: softColor,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: color,
      }}
    >
      <FlexWidget
        style={{
          width: 30,
          height: 30,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: color,
          borderRadius: 15,
          marginRight: 8,
        }}
      >
        <TextWidget text={glyph} style={{ fontSize: 18, fontWeight: '700', color: '#FFFFFF' }} />
      </FlexWidget>
      <TextWidget text={label} style={{ fontSize: 15, fontWeight: '700', color }} />
    </FlexWidget>
  );
}

export function QuickAddWidget() {
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: COLORS.card,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
        paddingHorizontal: 14,
        paddingVertical: 12,
      }}
    >
      {/* Header */}
      <FlexWidget
        style={{
          width: 'match_parent',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
          <FlexWidget
            style={{
              width: 26,
              height: 26,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: COLORS.blueSoft,
              borderRadius: 8,
              marginRight: 8,
            }}
          >
            <TextWidget text="$" style={{ fontSize: 15, fontWeight: '700', color: COLORS.blue }} />
          </FlexWidget>
          <TextWidget
            text="FinanceApp"
            style={{ fontSize: 15, fontWeight: '700', color: COLORS.text }}
          />
        </FlexWidget>
        <TextWidget
          text="Registro rápido"
          style={{ fontSize: 11, fontWeight: '500', color: COLORS.text2 }}
        />
      </FlexWidget>

      {/* Action buttons */}
      <FlexWidget
        style={{
          width: 'match_parent',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <ActionButton
          label="Gasto"
          glyph="−"
          color={COLORS.red}
          softColor={COLORS.redSoft}
          clickAction="ADD_GASTO"
        />
        <FlexWidget style={{ width: 10 }} />
        <ActionButton
          label="Ingreso"
          glyph="+"
          color={COLORS.green}
          softColor={COLORS.greenSoft}
          clickAction="ADD_INGRESO"
        />
      </FlexWidget>
    </FlexWidget>
  );
}

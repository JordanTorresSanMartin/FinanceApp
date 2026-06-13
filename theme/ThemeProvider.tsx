import { Material3Scheme, useMaterial3Theme } from '@pchmn/expo-material3-theme';
import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import {
  elevationSurface,
  FALLBACK_SOURCE_COLOR,
  motion,
  shape,
  spacing,
  typescale,
} from './tokens';

/**
 * Colores semánticos de finanzas que MD3 no define como roles.
 * Se mantienen como tonos propios (ingreso/gasto/alerta) pero afinados para ser
 * legibles tanto en claro como en oscuro, igual que los roles MD3.
 */
type FinanceColors = {
  income: string; onIncome: string; incomeContainer: string; onIncomeContainer: string;
  expense: string; onExpense: string; expenseContainer: string; onExpenseContainer: string;
  warning: string; onWarning: string; warningContainer: string; onWarningContainer: string;
};

const financeLight: FinanceColors = {
  income: '#1B873F', onIncome: '#FFFFFF', incomeContainer: '#C8F2D2', onIncomeContainer: '#06351A',
  expense: '#C0322B', onExpense: '#FFFFFF', expenseContainer: '#FFDAD6', onExpenseContainer: '#410002',
  warning: '#9A6700', onWarning: '#FFFFFF', warningContainer: '#FFE9B0', onWarningContainer: '#2A1800',
};

const financeDark: FinanceColors = {
  income: '#7BD995', onIncome: '#06351A', incomeContainer: '#0F5026', onIncomeContainer: '#C8F2D2',
  expense: '#FFB4AB', onExpense: '#690005', expenseContainer: '#93000A', onExpenseContainer: '#FFDAD6',
  warning: '#F2C14E', onWarning: '#3A2A00', warningContainer: '#5A4200', onWarningContainer: '#FFE9B0',
};

/** Color de cada nivel de elevación, resuelto desde los surfaceContainer* del esquema. */
type ElevationColors = Record<keyof typeof elevationSurface, string>;

export interface AppTheme {
  dark: boolean;
  /** Roles MD3 dinámicos (Material You / fallback) + colores de finanzas. */
  colors: Material3Scheme & FinanceColors;
  /** Color de superficie por nivel de elevación (0–4), elevación por color MD3. */
  elevation: ElevationColors;
  type: typeof typescale;
  shape: typeof shape;
  spacing: typeof spacing;
  motion: typeof motion;
}

const ThemeContext = createContext<AppTheme | null>(null);

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // En Android 12+ `theme` proviene del wallpaper (Dynamic Color).
  // En iOS / Android < 12 se genera desde FALLBACK_SOURCE_COLOR.
  const { theme } = useMaterial3Theme({ fallbackSourceColor: FALLBACK_SOURCE_COLOR });

  const value = useMemo<AppTheme>(() => {
    const scheme = isDark ? theme.dark : theme.light;
    const finance = isDark ? financeDark : financeLight;

    const elevation = Object.fromEntries(
      Object.entries(elevationSurface).map(([level, key]) => [
        level,
        scheme[key as keyof Material3Scheme] as string,
      ]),
    ) as ElevationColors;

    return {
      dark: isDark,
      colors: { ...scheme, ...finance },
      elevation,
      type: typescale,
      shape,
      spacing,
      motion,
    };
  }, [isDark, theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Hook único de acceso al tema en toda la app. */
export function useAppTheme(): AppTheme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useAppTheme debe usarse dentro de <AppThemeProvider>');
  return ctx;
}

import { DarkTheme, DefaultTheme, Theme, ThemeProvider } from '@react-navigation/native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';
import { useEffect, useRef, useState } from 'react';
import { Session } from '@supabase/supabase-js';

import { AppThemeProvider, useAppTheme } from '@/theme';
import { supabase } from '../lib/supabase';

// Keep splash screen visible while we determine auth state
SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <RootNavigator />
    </AppThemeProvider>
  );
}

function RootNavigator() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const isInitialLoad = useRef(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Listen for auth state changes (login / logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      // Only navigate on subsequent auth changes, not the initial one
      if (!isInitialLoad.current) {
        if (session) {
          router.replace('/(tabs)');
        } else {
          router.replace('/login');
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Once session is resolved, hide splash and do initial navigation
  useEffect(() => {
    if (session !== undefined) {
      // Navigate to the correct screen before hiding splash
      if (session) {
        router.replace('/(tabs)');
      } else {
        router.replace('/login');
      }
      // Small delay to let the target screen render before revealing
      const timeout = setTimeout(() => {
        SplashScreen.hideAsync();
        isInitialLoad.current = false;
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [session]);

  // Tema de navegación derivado de la paleta MD3 dinámica (Dynamic Color),
  // para que fondos y textos del navigator combinen con el resto de la app.
  const t = useAppTheme();
  const navTheme: Theme = {
    ...(t.dark ? DarkTheme : DefaultTheme),
    colors: {
      ...(t.dark ? DarkTheme : DefaultTheme).colors,
      primary: t.colors.primary,
      background: t.colors.background,
      card: t.colors.surface,
      text: t.colors.onSurface,
      border: t.colors.outlineVariant,
    },
  };

  // Render the navigator immediately (but splash covers it)
  return (
    <ThemeProvider value={navTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="analytics" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        <Stack.Screen
          name="transaction"
          options={{ headerShown: false }}
        />
      </Stack>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

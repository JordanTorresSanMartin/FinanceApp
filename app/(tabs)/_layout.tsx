import { Tabs } from 'expo-router';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { HapticTab } from '@/components/haptic-tab';
import { useAppTheme } from '@/theme';

export default function TabLayout() {
  const t = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        // MD3 navigation bar: activo = primary, inactivo = onSurfaceVariant,
        // contenedor = surfaceContainer (elevación por color, sin sombra dura).
        tabBarActiveTintColor: t.colors.primary,
        tabBarInactiveTintColor: t.colors.onSurfaceVariant,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: t.colors.surfaceContainer,
          borderTopWidth: 0,
          elevation: 0,
          height: 64,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          // labelMedium de la type scale MD3
          fontSize: t.type.labelMedium.fontSize,
          fontWeight: '500',
          letterSpacing: t.type.labelMedium.letterSpacing,
          marginBottom: 6,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transacciones',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="budget"
        options={{
          title: 'Presupuesto',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="pie-chart" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="summary"
        options={{
          title: 'Resumen',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="user"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

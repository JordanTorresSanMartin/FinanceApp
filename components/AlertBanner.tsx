import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAppTheme } from '@/theme';

export interface BudgetCategory {
  id: string;
  name: string;
  budget: number;
  spent: number;
}

export default function AlertBanner({ categories }: { categories?: BudgetCategory[] }) {
  const t = useAppTheme();
  const c = t.colors;

  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [data, setData] = useState<BudgetCategory[]>(categories || []);

  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    checkDismissedState();
    Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, tension: 70, friction: 12 }).start();
  }, []);

  useEffect(() => {
    if (categories) setData(categories);
  }, [categories]);

  const checkDismissedState = async () => {
    try {
      const dismissedDate = await AsyncStorage.getItem('alert_banner_dismissed_date');
      const today = new Date().toISOString().split('T')[0];
      if (dismissedDate === today) setDismissed(true);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDismiss = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(async () => {
      setDismissed(true);
      const today = new Date().toISOString().split('T')[0];
      await AsyncStorage.setItem('alert_banner_dismissed_date', today);
    });
  };

  const toggleExpand = () => {
    Haptics.selectionAsync();
    setExpanded(e => !e);
  };

  const excedidas = data.filter(cat => cat.budget > 0 && cat.spent / cat.budget >= 1);
  const advertencia = data.filter(cat => cat.budget > 0 && cat.spent / cat.budget >= 0.85 && cat.spent / cat.budget < 1);

  if (excedidas.length === 0 && advertencia.length === 0) return null;
  if (dismissed) return null;

  const monthName = new Date().toLocaleString('es-ES', { month: 'long' });
  const hasExcedidas = excedidas.length > 0;

  // Rol semántico según severidad (MD3 error / warning de finanzas)
  const accent = hasExcedidas ? c.expense : c.warning;
  const bannerBg = hasExcedidas ? c.expenseContainer : c.warningContainer;
  const onBanner = hasExcedidas ? c.onExpenseContainer : c.onWarningContainer;

  const translateY = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [-60, 0] });
  const opacity = slideAnim;

  return (
    <Animated.View style={[styles.container, { backgroundColor: bannerBg, opacity, transform: [{ translateY }] }]}>
      {/* Header row */}
      <Pressable style={styles.topRow} onPress={toggleExpand}>
        <View style={[styles.iconCircle, { backgroundColor: accent + '2E' }]}>
          <Ionicons name={hasExcedidas ? 'alert-circle' : 'warning'} size={20} color={accent} />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          {hasExcedidas && (
            <Text style={[styles.title, { color: onBanner }]}>
              {excedidas.length} categoría(s) excedieron el presupuesto de {monthName}
            </Text>
          )}
          {advertencia.length > 0 && (
            <Text style={[styles.title, { color: onBanner }]}>
              {advertencia.length} categoría(s) cerca del límite en {monthName}
            </Text>
          )}
        </View>
        <View style={styles.headerActions}>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={accent} />
          <Pressable onPress={handleDismiss} style={styles.closeBtn} hitSlop={8}>
            <Ionicons name="close" size={18} color={accent} />
          </Pressable>
        </View>
      </Pressable>

      {/* Expandable detail */}
      {expanded && (
        <View style={styles.details}>
          {excedidas.map(cat => {
            const pct = Math.round((cat.spent / cat.budget) * 100);
            const exceso = cat.spent - cat.budget;
            return (
              <View key={cat.id} style={[styles.detailRow, { backgroundColor: c.expense + '14' }]}>
                <View style={styles.detailLeft}>
                  <Text style={[styles.detailName, { color: onBanner }]}>{cat.name}</Text>
                  <Text style={[styles.detailSub, { color: onBanner, opacity: 0.75 }]}>
                    Pres. {formatK(cat.budget)} · Gastado {formatK(cat.spent)}
                  </Text>
                </View>
                <View style={styles.detailRight}>
                  <Text style={[styles.detailPct, { color: c.expense }]}>{pct}%</Text>
                  <Text style={[styles.detailExtra, { color: c.expense }]}>+{formatK(exceso)}</Text>
                </View>
              </View>
            );
          })}
          {advertencia.map(cat => {
            const pct = Math.round((cat.spent / cat.budget) * 100);
            const disponible = cat.budget - cat.spent;
            return (
              <View key={cat.id} style={[styles.detailRow, { backgroundColor: c.warning + '14' }]}>
                <View style={styles.detailLeft}>
                  <Text style={[styles.detailName, { color: onBanner }]}>{cat.name}</Text>
                  <Text style={[styles.detailSub, { color: onBanner, opacity: 0.75 }]}>
                    Pres. {formatK(cat.budget)} · Gastado {formatK(cat.spent)}
                  </Text>
                </View>
                <View style={styles.detailRight}>
                  <Text style={[styles.detailPct, { color: c.warning }]}>{pct}%</Text>
                  <Text style={[styles.detailExtra, { color: c.income }]}>{formatK(disponible)} disp.</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Animated.View>
  );
}

const formatK = (n: number) => {
  if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(0)}k`;
  return `$${n}`;
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 20, marginTop: 16, borderRadius: 24, overflow: 'hidden',
  },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 14 },
  iconCircle: { width: 36, height: 36, borderRadius: 999, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 13, fontWeight: '600', lineHeight: 18, marginBottom: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 2 },
  closeBtn: { padding: 2 },
  details: { paddingHorizontal: 14, paddingBottom: 14, gap: 8 },
  detailRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16,
  },
  detailLeft: { flex: 1 },
  detailName: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  detailSub: { fontSize: 12 },
  detailRight: { alignItems: 'flex-end' },
  detailPct: { fontSize: 16, fontWeight: '800' },
  detailExtra: { fontSize: 12, fontWeight: '600', marginTop: 2 },
});

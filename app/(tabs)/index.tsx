import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet, View, Text, ScrollView,
  RefreshControl, Animated, Pressable,
  Modal, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import AlertBanner from '../../components/AlertBanner';
import { supabase } from '../../lib/supabase';
import { BudgetStatusRow, MonthlySummary } from '../../types/finance';
import { FintocWidget } from '../../components/FintocWidget';
import { useAppTheme } from '@/theme';

// ── Animated skeleton for loading state ──────────────────────────────────────
function SkeletonBox({ width, height, color, style }: { width: any; height: number; color: string; style?: any }) {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });
  return (
    <Animated.View style={[{ width, height, borderRadius: 8, backgroundColor: color, opacity }, style]} />
  );
}

// ── Animated progress bar ─────────────────────────────────────────────────────
function AnimatedProgressBar({ pct, color }: { pct: number; color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: Math.min(pct / 100, 1), useNativeDriver: false, tension: 60, friction: 10 }).start();
  }, [pct]);
  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return <Animated.View style={{ width, height: '100%', borderRadius: 999, backgroundColor: color }} />;
}

export default function DashboardScreen() {
  const t = useAppTheme();
  const c = t.colors;
  const router = useRouter();

  const [date, setDate] = useState(new Date());
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [categories, setCategories] = useState<BudgetStatusRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showFintoc, setShowFintoc] = useState(false);

  // FAB press animation
  const fabScale = useRef(new Animated.Value(1)).current;

  const currentYear = date.getFullYear();
  const currentMonth = date.getMonth() + 1;
  const monthName = date.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
  const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  const getValidIcon = (name: string): any => {
    const map: Record<string, string> = {
      'dots-horizontal': 'ellipsis-horizontal',
      'credit-card': 'card-outline',
      'wrench': 'build-outline',
    };
    return map[name] || name || 'ellipse-outline';
  };

  const fetchData = async () => {
    try {
      const [{ data: summaryData }, { data: catData }] = await Promise.all([
        supabase.from('monthly_summary').select('*').eq('year', currentYear).eq('month', currentMonth).maybeSingle(),
        supabase.from('budget_status').select('*').eq('year', currentYear).eq('month', currentMonth).order('sort_order'),
      ]);
      setSummary(summaryData);
      setCategories(catData || []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [currentYear, currentMonth])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const navigateMonth = (dir: -1 | 1) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDate(d => new Date(d.getFullYear(), d.getMonth() + dir, 1));
  };

  const onFABPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.sequence([
      Animated.timing(fabScale, { toValue: 0.92, duration: 80, useNativeDriver: true }),
      Animated.timing(fabScale, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start(() => router.push('/transaction/new'));
  };

  const formatMoney = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');

  const handleLinkSuccess = async (publicToken: string) => {
    setShowFintoc(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("Error", "Usuario no autenticado");
        return;
      }
      const { data, error } = await supabase.functions.invoke('fintoc-exchange', {
        body: { public_token: publicToken, user_id: user.id }
      });
      if (error) throw error;
      Alert.alert("Éxito", `Banco ${data.bank_name || ''} vinculado correctamente`);
    } catch (err: any) {
      console.error(err);
      Alert.alert("Error", err.message);
    }
  };

  const s = summary || { total_income: 0, total_expenses: 0, balance: 0, savings_pct: 0 };
  const displayCategories = categories;

  // Estado del presupuesto → roles de finanzas (semánticos, accesibles en claro/oscuro)
  const getStatusColor = (status: string) =>
    status === 'excedido' ? c.expense : status === 'advertencia' ? c.warning : c.income;
  const getStatusIcon = (status: string) =>
    status === 'excedido' ? 'alert-circle' : status === 'advertencia' ? 'warning' : 'checkmark-circle';

  const balanceNegative = s.balance < 0;

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigateMonth(-1)}
          style={({ pressed }) => [styles.navBtn, { backgroundColor: t.elevation[3], opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="chevron-back" size={22} color={c.onSurface} />
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={[styles.headerLabel, { color: c.onSurfaceVariant }]}>Presupuesto</Text>
          <Text style={[t.type.titleLarge, { color: c.onSurface }]}>{capitalizedMonth}</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable
            onPress={() => navigateMonth(1)}
            style={({ pressed }) => [styles.navBtn, { backgroundColor: t.elevation[3], opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="chevron-forward" size={22} color={c.onSurface} />
          </Pressable>
          <Pressable
            onPress={() => { Haptics.selectionAsync(); router.push('/analytics' as Href); }}
            style={({ pressed }) => [styles.navBtn, { backgroundColor: t.colors.primaryContainer, opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="stats-chart" size={19} color={c.onPrimaryContainer} />
          </Pressable>
          <Pressable
            onPress={() => setShowFintoc(true)}
            style={({ pressed }) => [styles.navBtn, { backgroundColor: t.elevation[3], opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="business" size={20} color={c.onSurface} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />
        }
      >
        {/* ── Balance hero card (primaryContainer, cifra héroe display) ── */}
        <View style={[styles.heroCard, { backgroundColor: c.primaryContainer }]}>
          <Text style={[t.type.labelLarge, { color: c.onPrimaryContainer, opacity: 0.85 }]}>Balance neto</Text>
          {loading ? (
            <SkeletonBox width={200} height={48} color={c.onPrimaryContainer + '22'} style={{ marginVertical: 8, borderRadius: 12 }} />
          ) : (
            <Text style={[t.type.displayHero, { color: balanceNegative ? c.expense : c.onPrimaryContainer }]}>
              {formatMoney(s.balance)}
            </Text>
          )}
          <View style={[styles.heroPill, { backgroundColor: c.onPrimaryContainer + '1F' }]}>
            <Ionicons name="trending-up" size={14} color={c.onPrimaryContainer} />
            <Text style={[t.type.labelMedium, { color: c.onPrimaryContainer }]}>
              {loading ? '—' : `${s.savings_pct.toFixed(1)}% de ahorro`}
            </Text>
          </View>
        </View>

        {/* ── Alert Banner ── */}
        <AlertBanner categories={displayCategories.map(cat => ({
          id: cat.category_id, name: cat.category_name, budget: cat.budget_amount, spent: cat.spent
        }))} />

        {/* ── Ingresos / Gastos (cards tonales) ── */}
        <View style={styles.summaryRow}>
          <View style={[styles.tonalCard, { backgroundColor: c.incomeContainer }]}>
            <View style={styles.tonalCardHeader}>
              <View style={[styles.tonalIcon, { backgroundColor: c.income }]}>
                <Ionicons name="arrow-down" size={17} color={c.onIncome} />
              </View>
              <Text style={[t.type.labelLarge, { color: c.onIncomeContainer }]}>Ingresos</Text>
            </View>
            <Text style={[t.type.titleLarge, { color: c.onIncomeContainer, letterSpacing: -0.3 }]}>
              {loading ? '—' : formatMoney(s.total_income)}
            </Text>
          </View>

          <View style={[styles.tonalCard, { backgroundColor: c.expenseContainer }]}>
            <View style={styles.tonalCardHeader}>
              <View style={[styles.tonalIcon, { backgroundColor: c.expense }]}>
                <Ionicons name="arrow-up" size={17} color={c.onExpense} />
              </View>
              <Text style={[t.type.labelLarge, { color: c.onExpenseContainer }]}>Gastos</Text>
            </View>
            <Text style={[t.type.titleLarge, { color: c.onExpenseContainer, letterSpacing: -0.3 }]}>
              {loading ? '—' : formatMoney(s.total_expenses)}
            </Text>
          </View>
        </View>

        {/* ── Estado del presupuesto ── */}
        <View style={styles.sectionHeader}>
          <Text style={[t.type.titleLarge, { color: c.onSurface }]}>Estado del presupuesto</Text>
          <Text style={[t.type.bodyMedium, { color: c.onSurfaceVariant }]}>{displayCategories.length} categorías</Text>
        </View>

        <View style={styles.categoriesList}>
          {loading ? (
            [1, 2, 3].map(i => (
              <View key={i} style={[styles.catCard, { backgroundColor: t.elevation[1] }]}>
                <SkeletonBox width={44} height={44} color={c.surfaceVariant} style={{ borderRadius: 16, marginRight: 14 }} />
                <View style={{ flex: 1, gap: 8 }}>
                  <SkeletonBox width="60%" height={14} color={c.surfaceVariant} />
                  <SkeletonBox width="90%" height={8} color={c.surfaceVariant} />
                  <SkeletonBox width="40%" height={12} color={c.surfaceVariant} />
                </View>
              </View>
            ))
          ) : displayCategories.length === 0 ? (
            <View style={[styles.emptyBudget, { backgroundColor: t.elevation[1] }]}>
              <Ionicons name="pie-chart-outline" size={42} color={c.onSurfaceVariant} style={{ opacity: 0.6 }} />
              <Text style={[t.type.titleMedium, { color: c.onSurface }]}>Sin presupuestos este mes</Text>
              <Text style={[t.type.bodyMedium, { color: c.onSurfaceVariant, textAlign: 'center' }]}>
                Define montos por categoría en la pestaña Presupuesto para ver tu progreso aquí.
              </Text>
            </View>
          ) : (
            displayCategories.map((cat) => {
              const statusColor = getStatusColor(cat.status);
              const statusIcon = getStatusIcon(cat.status);
              return (
                <Pressable
                  key={cat.category_id}
                  style={({ pressed }) => [
                    styles.catCard,
                    { backgroundColor: t.elevation[1], opacity: pressed ? 0.85 : 1 }
                  ]}
                  onPress={() => Haptics.selectionAsync()}
                >
                  <View style={[styles.catIconWrap, { backgroundColor: (cat.color || c.primary) + '22' }]}>
                    <Ionicons name={getValidIcon(cat.icon as string)} size={22} color={cat.color || c.primary} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={styles.catTopRow}>
                      <Text style={[t.type.titleMedium, { color: c.onSurface }]}>{cat.category_name}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: statusColor + '22' }]}>
                        <Ionicons name={statusIcon as any} size={12} color={statusColor} />
                        <Text style={[t.type.labelMedium, { color: statusColor }]}>{Math.round(cat.pct_used)}%</Text>
                      </View>
                    </View>

                    <View style={[styles.progressBg, { backgroundColor: c.surfaceVariant }]}>
                      <AnimatedProgressBar pct={cat.pct_used} color={statusColor} />
                    </View>

                    <View style={styles.catAmounts}>
                      <Text style={[t.type.bodyMedium, { color: c.onSurfaceVariant }]}>
                        <Text style={{ color: c.onSurface, fontWeight: '600' }}>{formatMoney(cat.spent)}</Text>
                        {' de '}{formatMoney(cat.budget_amount)}
                      </Text>
                      {cat.status === 'excedido' && (
                        <Text style={[t.type.labelMedium, { color: c.expense }]}>
                          +{formatMoney(cat.spent - cat.budget_amount)} excedido
                        </Text>
                      )}
                    </View>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── Extended FAB ── */}
      <Animated.View style={[styles.fabWrap, { transform: [{ scale: fabScale }] }]}>
        <Pressable style={[styles.fab, { backgroundColor: c.primary }]} onPress={onFABPress}>
          <Ionicons name="add" size={24} color={c.onPrimary} />
          <Text style={[t.type.labelLarge, { color: c.onPrimary }]}>Agregar</Text>
        </Pressable>
      </Animated.View>

      <Modal visible={showFintoc} animationType="slide" onRequestClose={() => setShowFintoc(false)}>
        <View style={{ flex: 1, backgroundColor: c.background }}>
          <View style={styles.modalHeader}>
            <Text style={[t.type.headlineSmall, { color: c.onSurface }]}>Vincular cuenta</Text>
            <Pressable onPress={() => setShowFintoc(false)} style={[styles.navBtn, { backgroundColor: t.elevation[3] }]}>
              <Ionicons name="close" size={24} color={c.onSurface} />
            </Pressable>
          </View>
          <FintocWidget onLinkSuccess={handleLinkSuccess} />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, zIndex: 10,
  },
  navBtn: {
    width: 44, height: 44, borderRadius: 999,
    justifyContent: 'center', alignItems: 'center',
  },
  headerCenter: { alignItems: 'center' },
  headerLabel: { fontSize: 11, fontWeight: '500', letterSpacing: 0.5, textTransform: 'uppercase' },

  // Hero — shape.xl (28), elevación por color (sin sombra dura)
  heroCard: { marginHorizontal: 20, borderRadius: 28, padding: 24, marginBottom: 8 },
  heroPill: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, gap: 4, marginTop: 12,
  },

  // Ingresos / Gastos
  summaryRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginTop: 16 },
  tonalCard: { flex: 1, borderRadius: 24, padding: 16 },
  tonalCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  tonalIcon: { width: 30, height: 30, borderRadius: 999, justifyContent: 'center', alignItems: 'center' },

  // Section header
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, marginTop: 28, marginBottom: 12,
  },

  // Category cards — surfaceContainerLow, esquinas grandes, sin sombra
  categoriesList: { paddingHorizontal: 20, gap: 10 },
  catCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 24, padding: 16 },
  catIconWrap: { width: 44, height: 44, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  catTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  progressBg: { height: 8, borderRadius: 999, overflow: 'hidden', marginBottom: 8 },
  catAmounts: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  // Empty budget state
  emptyBudget: { alignItems: 'center', justifyContent: 'center', gap: 8, padding: 28, borderRadius: 28 },

  // Extended FAB
  fabWrap: { position: 'absolute', bottom: 28, right: 20 },
  fab: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    height: 56, paddingHorizontal: 22, borderRadius: 20,
    justifyContent: 'center',
    elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 6,
  },

  // Modal
  modalHeader: {
    paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
});

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity,
  RefreshControl, Animated, Pressable, ActivityIndicator,
  Modal, Alert
} from 'react-native';
import { useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import AlertBanner from '../../components/AlertBanner';
import { supabase } from '../../lib/supabase';
import { BudgetStatusRow, MonthlySummary } from '../../types/finance';
import { FintocWidget } from '../../components/FintocWidget';

// ── Animated skeleton for loading state ──────────────────────────────────────
function SkeletonBox({ width, height, style }: { width: any; height: number; style?: any }) {
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
    <Animated.View
      style={[{ width, height, borderRadius: 8, backgroundColor: '#BDBDBD', opacity }, style]}
    />
  );
}

// ── Animated progress bar ─────────────────────────────────────────────────────
function AnimatedProgressBar({ pct, color }: { pct: number; color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: Math.min(pct / 100, 1), useNativeDriver: false, tension: 60, friction: 10 }).start();
  }, [pct]);
  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <Animated.View style={{ width, height: '100%', borderRadius: 4, backgroundColor: color }} />
  );
}

// ── Summary card with fade-in ─────────────────────────────────────────────────
function SummaryCard({ label, value, color, icon, delay = 0 }: any) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, delay, useNativeDriver: true }),
    ]).start();
  }, [value]);
  return (
    <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <View style={[styles.summaryCard, { borderLeftColor: color, borderLeftWidth: 3 }]}>
        <View style={styles.summaryCardHeader}>
          <View style={[styles.summaryIconBg, { backgroundColor: `${color}20` }]}>
            <Ionicons name={icon} size={18} color={color} />
          </View>
          <Text style={styles.summaryLabel}>{label}</Text>
        </View>
        <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      </View>
    </Animated.View>
  );
}

export default function DashboardScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  const [date, setDate] = useState(new Date());
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [categories, setCategories] = useState<BudgetStatusRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showFintoc, setShowFintoc] = useState(false);

  // FAB pulse animation
  const fabScale = useRef(new Animated.Value(1)).current;
  const fabPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(fabPulse, { toValue: 1.15, duration: 1000, useNativeDriver: true }),
        Animated.timing(fabPulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const BG = isDark ? '#0F0F0F' : '#F4F6FB';
  const CARD = isDark ? '#1C1C1E' : '#FFFFFF';
  const TEXT = isDark ? '#F2F2F7' : '#1C1C1E';
  const TEXT2 = isDark ? '#8E8E93' : '#6C6C70';
  const BORDER = isDark ? '#2C2C2E' : '#E5E5EA';
  const GREEN = '#34C759';
  const RED = '#FF3B30';
  const BLUE = '#007AFF';
  const ORANGE = '#FF9500';

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
        supabase.from('monthly_summary').select('*').eq('year', currentYear).eq('month', currentMonth).single(),
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
      Animated.timing(fabScale, { toValue: 0.88, duration: 80, useNativeDriver: true }),
      Animated.timing(fabScale, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start(() => router.push('/transaction/new'));
  };

  const formatMoney = (n: number) =>
    '$' + Math.round(n).toLocaleString('es-CL');

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
  const displayCategories = categories.length > 0 ? categories : [
    { category_id: '1', category_name: 'Supermercado', icon: 'cart-outline', color: GREEN, budget_amount: 500000, spent: 480000, pct_used: 96, status: 'advertencia' as const },
    { category_id: '2', category_name: 'Transporte', icon: 'bus-outline', color: BLUE, budget_amount: 100000, spent: 110000, pct_used: 110, status: 'excedido' as const },
    { category_id: '3', category_name: 'Entretenimiento', icon: 'film-outline', color: '#BF5AF2', budget_amount: 150000, spent: 50000, pct_used: 33, status: 'ok' as const },
  ];

  const getStatusColor = (status: string) =>
    status === 'excedido' ? RED : status === 'advertencia' ? ORANGE : GREEN;

  const getStatusIcon = (status: string) =>
    status === 'excedido' ? 'alert-circle' : status === 'advertencia' ? 'warning' : 'checkmark-circle';

  return (
    <View style={[styles.screen, { backgroundColor: BG }]}>
      {/* ── Header (Static) ── */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable
            onPress={() => navigateMonth(-1)}
            style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.5 : 1 }]}
          >
            <Ionicons name="chevron-back" size={22} color={TEXT} />
          </Pressable>
        </View>

        <View style={styles.headerCenter}>
          <Text style={[styles.headerLabel, { color: TEXT2 }]}>Presupuesto</Text>
          <Text style={[styles.headerMonth, { color: TEXT }]}>{capitalizedMonth}</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable
            onPress={() => navigateMonth(1)}
            style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.5 : 1 }]}
          >
            <Ionicons name="chevron-forward" size={22} color={TEXT} />
          </Pressable>
          <Pressable
            onPress={() => setShowFintoc(true)}
            style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.5 : 1, marginLeft: 8 }]}
          >
            <Ionicons name="business" size={22} color={TEXT} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={BLUE}
          />
        }
      >
        {/* ── Balance hero card ── */}
        <View style={[styles.heroCard, { backgroundColor: isDark ? '#1C1C1E' : '#007AFF' }]}>
          <Text style={styles.heroLabel}>Balance Neto</Text>
          {loading ? (
            <SkeletonBox width={180} height={40} style={{ marginVertical: 8, borderRadius: 10 }} />
          ) : (
            <Text style={[styles.heroAmount, { color: s.balance >= 0 ? '#FFFFFF' : '#FF453A' }]}>
              {formatMoney(s.balance)}
            </Text>
          )}
          <View style={styles.heroPill}>
            <Ionicons name="trending-up" size={14} color="rgba(255,255,255,0.9)" />
            <Text style={styles.heroPillText}>
              {loading ? '—' : `${s.savings_pct.toFixed(1)}% de ahorro`}
            </Text>
          </View>
        </View>

        {/* ── Alert Banner ── */}
        <AlertBanner categories={displayCategories.map(c => ({
          id: c.category_id, name: c.category_name, budget: c.budget_amount, spent: c.spent
        }))} />

        {/* ── Summary cards ── */}
        <View style={styles.summarySection}>
          <View style={styles.summaryRow}>
            <SummaryCard
              label="Ingresos"
              value={loading ? '—' : formatMoney(s.total_income)}
              color={GREEN}
              icon="arrow-down-circle-outline"
              delay={0}
            />
            <View style={{ width: 12 }} />
            <SummaryCard
              label="Gastos"
              value={loading ? '—' : formatMoney(s.total_expenses)}
              color={RED}
              icon="arrow-up-circle-outline"
              delay={80}
            />
          </View>
        </View>

        {/* ── Categories ── */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: TEXT }]}>Estado del Presupuesto</Text>
          <Text style={[styles.sectionSub, { color: TEXT2 }]}>{displayCategories.length} categorías</Text>
        </View>

        <View style={styles.categoriesList}>
          {loading ? (
            [1, 2, 3].map(i => (
              <View key={i} style={[styles.catCard, { backgroundColor: CARD }]}>
                <SkeletonBox width={36} height={36} style={{ borderRadius: 12, marginRight: 12 }} />
                <View style={{ flex: 1, gap: 8 }}>
                  <SkeletonBox width="60%" height={14} />
                  <SkeletonBox width="90%" height={8} />
                  <SkeletonBox width="40%" height={12} />
                </View>
              </View>
            ))
          ) : (
            displayCategories.map((cat, idx) => {
              const statusColor = getStatusColor(cat.status);
              const statusIcon = getStatusIcon(cat.status);
              return (
                <Pressable
                  key={cat.category_id}
                  style={({ pressed }) => [
                    styles.catCard,
                    { backgroundColor: CARD, opacity: pressed ? 0.85 : 1, borderColor: BORDER }
                  ]}
                  onPress={() => Haptics.selectionAsync()}
                >
                  {/* Left accent bar */}
                  <View style={[styles.catAccent, { backgroundColor: statusColor }]} />

                  {/* Icon */}
                  <View style={[styles.catIconWrap, { backgroundColor: `${cat.color}18` }]}>
                    <Ionicons name={getValidIcon(cat.icon as string)} size={20} color={cat.color} />
                  </View>

                  {/* Content */}
                  <View style={{ flex: 1 }}>
                    <View style={styles.catTopRow}>
                      <Text style={[styles.catName, { color: TEXT }]}>{cat.category_name}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: `${statusColor}18` }]}>
                        <Ionicons name={statusIcon as any} size={12} color={statusColor} />
                        <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                          {Math.round(cat.pct_used)}%
                        </Text>
                      </View>
                    </View>

                    {/* Progress bar */}
                    <View style={[styles.progressBg, { backgroundColor: isDark ? '#3A3A3C' : '#F2F2F7' }]}>
                      <AnimatedProgressBar pct={cat.pct_used} color={statusColor} />
                    </View>

                    {/* Amounts */}
                    <View style={styles.catAmounts}>
                      <Text style={[styles.catAmountText, { color: TEXT2 }]}>
                        <Text style={{ color: TEXT, fontWeight: '600' }}>{formatMoney(cat.spent)}</Text>
                        {' de '}{formatMoney(cat.budget_amount)}
                      </Text>
                      {cat.status === 'excedido' && (
                        <Text style={[styles.catExcessText, { color: RED }]}>
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

        <View style={{ height: 110 }} />
      </ScrollView>

      {/* ── FAB ── */}
      <Animated.View style={[styles.fabShadow, { transform: [{ scale: fabScale }] }]}>
        <Pressable style={styles.fab} onPress={onFABPress}>
          <Ionicons name="add" size={28} color="#FFF" />
        </Pressable>
      </Animated.View>

      <Modal visible={showFintoc} animationType="slide" onRequestClose={() => setShowFintoc(false)}>
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={{ paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: TEXT }}>Vincular Cuenta</Text>
            <Pressable onPress={() => setShowFintoc(false)}>
              <Ionicons name="close" size={28} color={TEXT} />
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    zIndex: 10,
  },
  navBtn: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  headerCenter: { alignItems: 'center' },
  headerLabel: { fontSize: 12, fontWeight: '500', letterSpacing: 0.5, textTransform: 'uppercase' },
  headerMonth: { fontSize: 20, fontWeight: '700', marginTop: 2 },

  // Hero card
  heroCard: {
    marginHorizontal: 20,
    borderRadius: 24,
    padding: 24,
    marginBottom: 8,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  heroLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '500', marginBottom: 4 },
  heroAmount: { fontSize: 40, fontWeight: '800', letterSpacing: -1, marginBottom: 12 },
  heroPill: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6, gap: 4,
  },
  heroPillText: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '600' },

  // Summary
  summarySection: { paddingHorizontal: 20, marginTop: 16, marginBottom: 8 },
  summaryRow: { flexDirection: 'row' },
  summaryCard: {
    flex: 1, backgroundColor: '#FFF', borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  summaryCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  summaryIconBg: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  summaryLabel: { fontSize: 13, fontWeight: '500', color: '#6C6C70' },
  summaryValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },

  // Section header
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, marginTop: 24, marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  sectionSub: { fontSize: 13 },

  // Category cards
  categoriesList: { paddingHorizontal: 20, gap: 12 },
  catCard: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth,
  },
  catAccent: { width: 3, height: '100%', borderRadius: 2, marginRight: 14, position: 'absolute', left: 0, top: 0 },
  catIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  catTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  catName: { fontSize: 15, fontWeight: '600' },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20,
  },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },
  progressBg: { height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  catAmounts: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catAmountText: { fontSize: 13 },
  catExcessText: { fontSize: 12, fontWeight: '600' },

  // FAB
  fabShadow: {
    position: 'absolute', bottom: 30, right: 24,
    shadowColor: '#007AFF', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45, shadowRadius: 16, elevation: 12,
  },
  fab: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center',
  },
});

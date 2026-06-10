import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView, Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View
} from 'react-native';
import AlertBanner from '../../components/AlertBanner';
import { supabase } from '../../lib/supabase';
import { Category } from '../../types/finance';

interface CalculatedBudget {
  category_id: string;
  category_name: string;
  icon: string;
  color: string;
  budget_amount: number;
  spent: number;
  pct_used: number;
  status: 'ok' | 'advertencia' | 'excedido';
}

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

export default function BudgetScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [date, setDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Real data state
  const [categories, setCategories] = useState<Category[]>([]);
  const [calculatedBudgets, setCalculatedBudgets] = useState<CalculatedBudget[]>([]);
  const [totalBudget, setTotalBudget] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);

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
      setLoading(true);

      // Verify the user is authenticated before querying
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn('[Budget] No authenticated user, skipping fetch.');
        return;
      }

      const pad = (n: number) => n.toString().padStart(2, '0');
      const monthStart = `${currentYear}-${pad(currentMonth)}-01`;
      const monthEnd = `${currentYear}-${pad(currentMonth)}-31`;

      // 1. Fetch all categories — RLS filters by user_id automatically
      const { data: catsData, error: catsErr } = await supabase
        .from('categories')
        .select('*')
        .in('type', ['gasto', 'ambos'])
        .order('sort_order');
      if (catsErr) throw catsErr;

      // 2. Fetch budgets for this month — RLS filters by user_id automatically
      const { data: budgetsData, error: budgErr } = await supabase
        .from('budgets')
        .select('*')
        .eq('year', currentYear)
        .eq('month', currentMonth);
      if (budgErr) throw budgErr;

      // 3. Fetch transactions for this month — RLS filters by user_id automatically
      const { data: txData, error: txErr } = await supabase
        .from('transactions')
        .select('category_id, amount')
        .eq('type', 'gasto')
        .gte('date', monthStart)
        .lte('date', monthEnd);
      if (txErr) throw txErr;

      const cats = catsData || [];
      const budgs = budgetsData || [];
      const txs = txData || [];

      let sumBudget = 0;
      let sumSpent = 0;

      const calculated: CalculatedBudget[] = cats.map(c => {
        const budgetRow = budgs.find(b => b.category_id === c.id);
        const budgetAmount = budgetRow?.amount || 0;
        const spent = txs.filter(t => t.category_id === c.id).reduce((s, t) => s + t.amount, 0);

        let pct = 0;
        if (budgetAmount > 0) pct = (spent / budgetAmount) * 100;
        else if (spent > 0) pct = 100;

        const status = pct >= 100 ? 'excedido' : pct >= 85 ? 'advertencia' : 'ok';

        sumBudget += budgetAmount;
        sumSpent += spent;

        return {
          category_id: c.id,
          category_name: c.name,
          icon: c.icon,
          color: c.color,
          budget_amount: budgetAmount,
          spent: spent,
          pct_used: pct,
          status
        };
      });

      setCategories(cats);
      setCalculatedBudgets(calculated);
      setTotalBudget(sumBudget);
      setTotalSpent(sumSpent);
    } catch (e) {
      console.error('Error fetching budget data:', e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [currentYear, currentMonth])
  );

  const handleUpdateBudget = async (category_id: string, newAmountStr: string) => {
    const amount = parseInt(newAmountStr.replace(/[^0-9]/g, '')) || 0;

    // Optimistic UI Update
    const prevBudgets = [...calculatedBudgets];
    setCalculatedBudgets(prev => prev.map(b => {
      if (b.category_id === category_id) {
        let pct = amount > 0 ? (b.spent / amount) * 100 : (b.spent > 0 ? 100 : 0);
        return {
          ...b,
          budget_amount: amount,
          pct_used: pct,
          status: pct >= 100 ? 'excedido' : pct >= 85 ? 'advertencia' : 'ok'
        };
      }
      return b;
    }));

    setSavingId(category_id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error('Usuario no autenticado');
      }

      const { error } = await supabase.from('budgets')
        .upsert({
          user_id: user.id,
          category_id,
          year: currentYear,
          month: currentMonth,
          amount
        }, { onConflict: 'user_id,category_id,year,month' });

      if (error) {
        throw error;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Error saving budget:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // Revert on error
      setCalculatedBudgets(prevBudgets);
    } finally {
      setSavingId(null);
      // Recalculate totals
      fetchData();
    }
  };

  const navigateMonth = (dir: -1 | 1) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDate(d => new Date(d.getFullYear(), d.getMonth() + dir, 1));
  };

  const formatMoney = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');
  const totalAvailable = totalBudget - totalSpent;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.screen, { backgroundColor: BG }]}>

        {/* ── Static Header ── */}
        <View style={styles.header}>
          <Pressable
            onPress={() => navigateMonth(-1)}
            style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.5 : 1 }]}
          >
            <Ionicons name="chevron-back" size={22} color={TEXT} />
          </Pressable>

          <View style={styles.headerCenter}>
            <Text style={[styles.headerLabel, { color: TEXT2 }]}>Presupuesto</Text>
            <Text style={[styles.headerMonth, { color: TEXT }]}>{capitalizedMonth}</Text>
          </View>

          <Pressable
            onPress={() => navigateMonth(1)}
            style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.5 : 1 }]}
          >
            <Ionicons name="chevron-forward" size={22} color={TEXT} />
          </Pressable>
        </View>

        {/* ── Totals Dashboard ── */}
        <View style={styles.totalsWrapper}>
          <View style={[styles.totalsCard, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF', borderColor: BORDER }]}>
            <View style={styles.totalsRow}>
              <View style={styles.totalBox}>
                <Text style={[styles.totalLabel, { color: TEXT2 }]}>Presupuesto Total</Text>
                <Text style={[styles.totalValue, { color: TEXT }]}>
                  {loading ? '—' : formatMoney(totalBudget)}
                </Text>
              </View>
              <View style={styles.totalsDivider} />
              <View style={styles.totalBox}>
                <Text style={[styles.totalLabel, { color: TEXT2 }]}>Disponible</Text>
                <Text style={[styles.totalValue, { color: totalAvailable < 0 ? RED : GREEN }]}>
                  {loading ? '—' : formatMoney(totalAvailable)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <ScrollView style={styles.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          <AlertBanner categories={calculatedBudgets.map(c => ({
            id: c.category_id, name: c.category_name, budget: c.budget_amount, spent: c.spent
          }))} />

          <View style={styles.list}>
            {loading ? (
              <ActivityIndicator size="large" color={BLUE} style={{ marginTop: 40 }} />
            ) : calculatedBudgets.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="folder-open-outline" size={40} color={TEXT2} />
                <Text style={{ color: TEXT2, marginTop: 10, textAlign: 'center' }}>
                  No tienes categorías de gasto en la base de datos.{'\n'}Añádelas en la tabla 'categories'.
                </Text>
              </View>
            ) : (
              calculatedBudgets.map(cat => {
                const isExcedido = cat.status === 'excedido';
                const isWarning = cat.status === 'advertencia';
                const statusColor = isExcedido ? RED : isWarning ? ORANGE : GREEN;

                return (
                  <View key={cat.category_id} style={[styles.catRow, { backgroundColor: CARD, borderColor: BORDER }]}>
                    <View style={styles.catHeader}>
                      <View style={[styles.iconBox, { backgroundColor: `${cat.color}20` }]}>
                        <Ionicons name={getValidIcon(cat.icon)} size={20} color={cat.color} />
                      </View>
                      <Text style={[styles.catName, { color: TEXT }]}>{cat.category_name}</Text>
                      {savingId === cat.category_id && (
                        <ActivityIndicator size="small" color={BLUE} style={{ marginLeft: 8 }} />
                      )}
                    </View>

                    <View style={styles.inputsRow}>
                      <View style={styles.inputGroup}>
                        <Text style={[styles.inputLabel, { color: TEXT2 }]}>Presupuesto asignado</Text>
                        <TextInput
                          style={[styles.input, { color: TEXT, backgroundColor: isDark ? '#2C2C2E' : '#F2F2F7' }]}
                          defaultValue={cat.budget_amount ? cat.budget_amount.toString() : ''}
                          placeholder="0"
                          placeholderTextColor={TEXT2}
                          keyboardType="numeric"
                          onEndEditing={(e) => handleUpdateBudget(cat.category_id, e.nativeEvent.text)}
                          returnKeyType="done"
                        />
                      </View>
                      <View style={styles.inputGroup}>
                        <Text style={[styles.inputLabel, { color: TEXT2 }]}>Gastado mes</Text>
                        <View style={[styles.spentBox, { backgroundColor: `${statusColor}10` }]}>
                          <Text style={[styles.spentText, { color: isExcedido ? RED : TEXT }]}>
                            {formatMoney(cat.spent)}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.progressRow}>
                      <View style={[styles.progressBarBg, { backgroundColor: isDark ? '#3A3A3C' : '#F2F2F7' }]}>
                        <AnimatedProgressBar pct={cat.pct_used} color={statusColor} />
                      </View>
                      <Text style={[styles.pctText, { color: statusColor }]}>{Math.round(cat.pct_used)}%</Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
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

  // Totals
  totalsWrapper: { paddingHorizontal: 20, marginBottom: 8 },
  totalsCard: {
    borderRadius: 16, padding: 20, borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 4,
  },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalBox: { flex: 1 },
  totalLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  totalValue: { fontSize: 24, fontWeight: '800' },
  totalsDivider: { width: StyleSheet.hairlineWidth, height: 40, backgroundColor: '#C7C7CC', marginHorizontal: 16 },

  container: { flex: 1 },

  list: { paddingHorizontal: 20, marginTop: 12, gap: 16 },
  catRow: {
    padding: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 2,
  },
  catHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  iconBox: {
    width: 36, height: 36, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  catName: { fontSize: 16, fontWeight: '600' },

  inputsRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  inputGroup: { flex: 1 },
  inputLabel: { fontSize: 12, fontWeight: '500', marginBottom: 6 },
  input: {
    height: 44, borderRadius: 10, paddingHorizontal: 12, fontSize: 16, fontWeight: '600',
  },
  spentBox: {
    height: 44, borderRadius: 10, paddingHorizontal: 12, justifyContent: 'center',
  },
  spentText: { fontSize: 16, fontWeight: '700' },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  progressBarBg: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  pctText: { fontSize: 12, fontWeight: '800', width: 36, textAlign: 'right' },

  emptyState: { alignItems: 'center', justifyContent: 'center', padding: 40 },
});

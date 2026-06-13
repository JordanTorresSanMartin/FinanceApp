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
  View
} from 'react-native';
import AlertBanner from '../../components/AlertBanner';
import { supabase } from '../../lib/supabase';
import { Category } from '../../types/finance';
import { useAppTheme } from '@/theme';

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
  return <Animated.View style={{ width, height: '100%', borderRadius: 999, backgroundColor: color }} />;
}

export default function BudgetScreen() {
  const t = useAppTheme();
  const c = t.colors;

  const [date, setDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [calculatedBudgets, setCalculatedBudgets] = useState<CalculatedBudget[]>([]);
  const [totalBudget, setTotalBudget] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);

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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn('[Budget] No authenticated user, skipping fetch.');
        return;
      }

      const pad = (n: number) => n.toString().padStart(2, '0');
      const monthStart = `${currentYear}-${pad(currentMonth)}-01`;
      const monthEnd = `${currentYear}-${pad(currentMonth)}-31`;

      const { data: catsData, error: catsErr } = await supabase
        .from('categories').select('*').in('type', ['gasto', 'ambos']).order('sort_order');
      if (catsErr) throw catsErr;

      const { data: budgetsData, error: budgErr } = await supabase
        .from('budgets').select('*').eq('year', currentYear).eq('month', currentMonth);
      if (budgErr) throw budgErr;

      const { data: txData, error: txErr } = await supabase
        .from('transactions').select('category_id, amount')
        .eq('type', 'gasto').gte('date', monthStart).lte('date', monthEnd);
      if (txErr) throw txErr;

      const cats = catsData || [];
      const budgs = budgetsData || [];
      const txs = txData || [];

      let sumBudget = 0;
      let sumSpent = 0;

      const calculated: CalculatedBudget[] = cats.map(cat => {
        const budgetRow = budgs.find(b => b.category_id === cat.id);
        const budgetAmount = budgetRow?.amount || 0;
        const spent = txs.filter(tx => tx.category_id === cat.id).reduce((sum, tx) => sum + tx.amount, 0);

        let pct = 0;
        if (budgetAmount > 0) pct = (spent / budgetAmount) * 100;
        else if (spent > 0) pct = 100;

        const status = pct >= 100 ? 'excedido' : pct >= 85 ? 'advertencia' : 'ok';

        sumBudget += budgetAmount;
        sumSpent += spent;

        return {
          category_id: cat.id,
          category_name: cat.name,
          icon: cat.icon,
          color: cat.color,
          budget_amount: budgetAmount,
          spent,
          pct_used: pct,
          status,
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

    const prevBudgets = [...calculatedBudgets];
    setCalculatedBudgets(prev => prev.map(b => {
      if (b.category_id === category_id) {
        let pct = amount > 0 ? (b.spent / amount) * 100 : (b.spent > 0 ? 100 : 0);
        return {
          ...b,
          budget_amount: amount,
          pct_used: pct,
          status: pct >= 100 ? 'excedido' : pct >= 85 ? 'advertencia' : 'ok',
        };
      }
      return b;
    }));

    setSavingId(category_id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error('Usuario no autenticado');

      const { error } = await supabase.from('budgets')
        .upsert({ user_id: user.id, category_id, year: currentYear, month: currentMonth, amount },
          { onConflict: 'user_id,category_id,year,month' });
      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Error saving budget:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setCalculatedBudgets(prevBudgets);
    } finally {
      setSavingId(null);
      fetchData();
    }
  };

  const navigateMonth = (dir: -1 | 1) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDate(d => new Date(d.getFullYear(), d.getMonth() + dir, 1));
  };

  const formatMoney = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');
  const totalAvailable = totalBudget - totalSpent;

  const statusColorFor = (status: string) =>
    status === 'excedido' ? c.expense : status === 'advertencia' ? c.warning : c.income;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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

          <Pressable
            onPress={() => navigateMonth(1)}
            style={({ pressed }) => [styles.navBtn, { backgroundColor: t.elevation[3], opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="chevron-forward" size={22} color={c.onSurface} />
          </Pressable>
        </View>

        {/* ── Totals (primaryContainer) ── */}
        <View style={styles.totalsWrapper}>
          <View style={[styles.totalsCard, { backgroundColor: c.primaryContainer }]}>
            <View style={styles.totalsRow}>
              <View style={styles.totalBox}>
                <Text style={[t.type.labelMedium, { color: c.onPrimaryContainer, opacity: 0.85, textTransform: 'uppercase' }]}>Presupuesto total</Text>
                <Text style={[t.type.headlineSmall, { color: c.onPrimaryContainer, marginTop: 4 }]}>
                  {loading ? '—' : formatMoney(totalBudget)}
                </Text>
              </View>
              <View style={[styles.totalsDivider, { backgroundColor: c.onPrimaryContainer + '33' }]} />
              <View style={styles.totalBox}>
                <Text style={[t.type.labelMedium, { color: c.onPrimaryContainer, opacity: 0.85, textTransform: 'uppercase' }]}>Disponible</Text>
                <Text style={[t.type.headlineSmall, { color: totalAvailable < 0 ? c.expense : c.onPrimaryContainer, marginTop: 4 }]}>
                  {loading ? '—' : formatMoney(totalAvailable)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <ScrollView style={styles.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          <AlertBanner categories={calculatedBudgets.map(cat => ({
            id: cat.category_id, name: cat.category_name, budget: cat.budget_amount, spent: cat.spent
          }))} />

          <View style={styles.list}>
            {loading ? (
              <ActivityIndicator size="large" color={c.primary} style={{ marginTop: 40 }} />
            ) : calculatedBudgets.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="folder-open-outline" size={40} color={c.onSurfaceVariant} />
                <Text style={[t.type.bodyMedium, { color: c.onSurfaceVariant, marginTop: 10, textAlign: 'center' }]}>
                  No tienes categorías de gasto en la base de datos.{'\n'}Añádelas en la tabla categories.
                </Text>
              </View>
            ) : (
              calculatedBudgets.map(cat => {
                const isExcedido = cat.status === 'excedido';
                const statusColor = statusColorFor(cat.status);

                return (
                  <View key={cat.category_id} style={[styles.catRow, { backgroundColor: t.elevation[1] }]}>
                    <View style={styles.catHeader}>
                      <View style={[styles.iconBox, { backgroundColor: (cat.color || c.primary) + '22' }]}>
                        <Ionicons name={getValidIcon(cat.icon)} size={20} color={cat.color || c.primary} />
                      </View>
                      <Text style={[t.type.titleMedium, { color: c.onSurface }]}>{cat.category_name}</Text>
                      {savingId === cat.category_id && (
                        <ActivityIndicator size="small" color={c.primary} style={{ marginLeft: 8 }} />
                      )}
                    </View>

                    <View style={styles.inputsRow}>
                      <View style={styles.inputGroup}>
                        <Text style={[t.type.labelMedium, { color: c.onSurfaceVariant, marginBottom: 6 }]}>Presupuesto asignado</Text>
                        <TextInput
                          style={[styles.input, { color: c.onSurface, backgroundColor: t.elevation[3] }]}
                          defaultValue={cat.budget_amount ? cat.budget_amount.toString() : ''}
                          placeholder="0"
                          placeholderTextColor={c.onSurfaceVariant}
                          keyboardType="numeric"
                          onEndEditing={(e) => handleUpdateBudget(cat.category_id, e.nativeEvent.text)}
                          returnKeyType="done"
                        />
                      </View>
                      <View style={styles.inputGroup}>
                        <Text style={[t.type.labelMedium, { color: c.onSurfaceVariant, marginBottom: 6 }]}>Gastado mes</Text>
                        <View style={[styles.spentBox, { backgroundColor: statusColor + '1A' }]}>
                          <Text style={[t.type.titleMedium, { color: isExcedido ? c.expense : c.onSurface, fontWeight: '700' }]}>
                            {formatMoney(cat.spent)}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.progressRow}>
                      <View style={[styles.progressBarBg, { backgroundColor: c.surfaceVariant }]}>
                        <AnimatedProgressBar pct={cat.pct_used} color={statusColor} />
                      </View>
                      <Text style={[t.type.labelLarge, { color: statusColor, width: 40, textAlign: 'right' }]}>{Math.round(cat.pct_used)}%</Text>
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

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, zIndex: 10,
  },
  navBtn: { width: 40, height: 40, borderRadius: 999, justifyContent: 'center', alignItems: 'center' },
  headerCenter: { alignItems: 'center' },
  headerLabel: { fontSize: 11, fontWeight: '500', letterSpacing: 0.5, textTransform: 'uppercase' },

  // Totals — shape.xl, elevación por color
  totalsWrapper: { paddingHorizontal: 20, marginBottom: 8 },
  totalsCard: { borderRadius: 28, padding: 20 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalBox: { flex: 1 },
  totalsDivider: { width: StyleSheet.hairlineWidth, height: 40, marginHorizontal: 16 },

  container: { flex: 1 },

  list: { paddingHorizontal: 20, marginTop: 12, gap: 12 },
  catRow: { padding: 16, borderRadius: 24 },
  catHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  iconBox: { width: 40, height: 40, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 12 },

  inputsRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  inputGroup: { flex: 1 },
  input: { height: 48, borderRadius: 16, paddingHorizontal: 14, fontSize: 16, fontWeight: '600' },
  spentBox: { height: 48, borderRadius: 16, paddingHorizontal: 14, justifyContent: 'center' },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  progressBarBg: { flex: 1, height: 8, borderRadius: 999, overflow: 'hidden' },

  emptyState: { alignItems: 'center', justifyContent: 'center', padding: 40 },
});

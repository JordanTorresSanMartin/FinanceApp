import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, View, Text, ScrollView,
  TextInput, Pressable, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Transaction } from '../../types/finance';
import { useAppTheme } from '@/theme';

// ── Animated list item ─────────────────────────────────────────────────────────
function TxItem({ item, index, formatMoney, onPress }: any) {
  const t = useAppTheme();
  const c = t.colors;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, delay: index * 50, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 350, delay: index * 50, useNativeDriver: true }),
    ]).start();
  }, []);

  const getValidIcon = (name: string): any => {
    const map: Record<string, string> = {
      'dots-horizontal': 'ellipsis-horizontal',
      'credit-card': 'card-outline',
      'wrench': 'build-outline',
    };
    return map[name] || name || 'ellipse-outline';
  };

  const isIncome = item.type === 'ingreso';
  const catColor = item.categories?.color || c.primary;

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <Pressable
        style={({ pressed }) => [
          styles.txItem,
          { backgroundColor: t.elevation[1], opacity: pressed ? 0.75 : 1 }
        ]}
        onPress={() => { Haptics.selectionAsync(); onPress?.(item); }}
      >
        <View style={[styles.txIconWrap, { backgroundColor: catColor + '22' }]}>
          <Ionicons name={getValidIcon(item.categories?.icon)} size={22} color={catColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[t.type.titleMedium, { color: c.onSurface }]} numberOfLines={1}>{item.description}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Text style={[t.type.bodyMedium, { color: c.onSurfaceVariant }]}>{item.categories?.name || 'Sin categoría'}</Text>
            {item.source && (
              <View style={[styles.txSourcePill, { backgroundColor: c.primary + '1F' }]}>
                <Ionicons name="mail" size={9} color={c.primary} />
                <Text style={[t.type.labelSmall, { color: c.primary }]}>{item.source}</Text>
              </View>
            )}
          </View>
        </View>
        <Text style={[t.type.titleMedium, { color: isIncome ? c.income : c.expense, fontWeight: '700' }]}>
          {isIncome ? '+' : '-'}{formatMoney(item.amount)}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export default function TransactionsScreen() {
  const t = useAppTheme();
  const c = t.colors;
  const router = useRouter();

  const [date, setDate] = useState(new Date());
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'todos' | 'ingreso' | 'gasto'>('todos');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const currentYear = date.getFullYear();
  const currentMonth = date.getMonth() + 1;
  const monthName = date.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
  const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  useFocusEffect(
    React.useCallback(() => {
      setLoading(true);
      fetchTransactions();
    }, [currentYear, currentMonth])
  );

  const fetchTransactions = async () => {
    try {
      const pad = (n: number) => n.toString().padStart(2, '0');
      const startDate = `${currentYear}-${pad(currentMonth)}-01`;
      const lastDay = new Date(currentYear, currentMonth, 0).getDate();
      const endDate = `${currentYear}-${pad(currentMonth)}-${pad(lastDay)}`;

      const { data, error } = await supabase
        .from('transactions')
        .select(`*, categories(name, icon, color)`)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false });

      if (error) console.error('[Transactions] Supabase error:', error.message);
      setTransactions(data || []);
    } catch (error) {
      console.error('[Transactions] Catch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const navigateMonth = (dir: -1 | 1) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDate(d => new Date(d.getFullYear(), d.getMonth() + dir, 1));
  };

  const formatMoney = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');

  const filtered = transactions.filter(tx => {
    if (typeFilter !== 'todos' && tx.type !== typeFilter) return false;
    if (search && !tx.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalIngresos = filtered.filter(tx => tx.type === 'ingreso').reduce((sum, tx) => sum + tx.amount, 0);
  const totalGastos = filtered.filter(tx => tx.type === 'gasto').reduce((sum, tx) => sum + tx.amount, 0);

  const grouped: Record<string, typeof filtered> = {};
  filtered.forEach(tx => {
    if (!grouped[tx.date]) grouped[tx.date] = [];
    grouped[tx.date].push(tx);
  });

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    const today = new Date();
    const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Hoy';
    if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
    return d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const FILTERS: Array<'todos' | 'ingreso' | 'gasto'> = ['todos', 'ingreso', 'gasto'];

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      {/* ── Sticky Header (surfaceContainer) ── */}
      <View style={[styles.header, { backgroundColor: c.surface }]}>
        <View style={styles.monthNav}>
          <Pressable
            onPress={() => navigateMonth(-1)}
            style={({ pressed }) => [styles.navBtn, { backgroundColor: t.elevation[3], opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="chevron-back" size={22} color={c.onSurface} />
          </Pressable>
          <Text style={[t.type.titleLarge, { color: c.onSurface }]}>{capitalizedMonth}</Text>
          <Pressable
            onPress={() => navigateMonth(1)}
            style={({ pressed }) => [styles.navBtn, { backgroundColor: t.elevation[3], opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="chevron-forward" size={22} color={c.onSurface} />
          </Pressable>
        </View>

        {/* Search */}
        <View style={[styles.searchBox, { backgroundColor: t.elevation[2] }]}>
          <Ionicons name="search" size={18} color={c.onSurfaceVariant} />
          <TextInput
            style={[styles.searchInput, { color: c.onSurface }]}
            placeholder="Buscar transacción..."
            placeholderTextColor={c.onSurfaceVariant}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={c.onSurfaceVariant} />
            </Pressable>
          )}
        </View>

        {/* Filter chips (MD3: activo relleno semántico, inactivo tonal) */}
        <View style={styles.filterRow}>
          {FILTERS.map(f => {
            const active = typeFilter === f;
            const chipColor = f === 'ingreso' ? c.income : f === 'gasto' ? c.expense : c.primary;
            const onChip = f === 'ingreso' ? c.onIncome : f === 'gasto' ? c.onExpense : c.onPrimary;
            return (
              <Pressable
                key={f}
                style={[styles.chip, { backgroundColor: active ? chipColor : t.elevation[2] }]}
                onPress={() => { Haptics.selectionAsync(); setTypeFilter(f); }}
              >
                <Text style={[t.type.labelLarge, { color: active ? onChip : c.onSurfaceVariant }]}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── List ── */}
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110, ...(filtered.length === 0 && { flex: 1 }) }}>
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={56} color={c.onSurfaceVariant} style={{ opacity: 0.4 }} />
            <Text style={[t.type.titleLarge, { color: c.onSurface }]}>Sin transacciones</Text>
            <Text style={[t.type.bodyMedium, { color: c.onSurfaceVariant, textAlign: 'center' }]}>
              No hay movimientos en {capitalizedMonth.toLowerCase()}
            </Text>
          </View>
        ) : (
          Object.entries(grouped).map(([dateStr, items], gIdx) => {
            const dayTotal = items.reduce((sum, tx) => sum + (tx.type === 'ingreso' ? tx.amount : -tx.amount), 0);
            return (
              <View key={dateStr} style={styles.dayGroup}>
                <View style={styles.dayHeaderRow}>
                  <Text style={[t.type.labelLarge, { color: c.onSurfaceVariant, textTransform: 'capitalize' }]}>{formatDate(dateStr)}</Text>
                  <View style={[styles.dayDivider, { backgroundColor: c.outlineVariant }]} />
                  <Text style={[t.type.labelMedium, { color: dayTotal >= 0 ? c.income : c.onSurfaceVariant }]}>
                    {dayTotal >= 0 ? '+' : '-'}{formatMoney(Math.abs(dayTotal))}
                  </Text>
                </View>
                {items.map((tx, idx) => (
                  <TxItem
                    key={tx.id}
                    item={tx}
                    index={gIdx * 10 + idx}
                    formatMoney={formatMoney}
                    onPress={(item: Transaction) => router.push(`/transaction/${item.id}`)}
                  />
                ))}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* ── Footer totals (surfaceContainer) ── */}
      <View style={[styles.footer, { backgroundColor: c.surfaceContainer }]}>
        <View style={styles.footerHalf}>
          <Text style={[t.type.labelMedium, { color: c.onSurfaceVariant, textTransform: 'uppercase' }]}>Ingresos</Text>
          <Text style={[t.type.titleMedium, { color: c.income, fontWeight: '700' }]}>{formatMoney(totalIngresos)}</Text>
        </View>
        <View style={[styles.footerDivider, { backgroundColor: c.outlineVariant }]} />
        <View style={styles.footerHalf}>
          <Text style={[t.type.labelMedium, { color: c.onSurfaceVariant, textTransform: 'uppercase' }]}>Gastos</Text>
          <Text style={[t.type.titleMedium, { color: c.expense, fontWeight: '700' }]}>{formatMoney(totalGastos)}</Text>
        </View>
        <Pressable
          style={[styles.addBtn, { backgroundColor: c.primary }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push('/transaction/new');
          }}
        >
          <Ionicons name="add" size={24} color={c.onPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  // Header
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 14 },
  monthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  navBtn: { width: 40, height: 40, borderRadius: 999, justifyContent: 'center', alignItems: 'center' },

  // Search
  searchBox: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14,
    height: 48, borderRadius: 999, marginBottom: 12, gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15 },

  // Filter chips
  filterRow: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999 },

  // Day group
  dayGroup: { paddingHorizontal: 20, paddingTop: 20 },
  dayHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  dayDivider: { flex: 1, height: StyleSheet.hairlineWidth },

  // Source pill (imported from Gmail)
  txSourcePill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999,
  },

  // Transaction item — surfaceContainerLow, sin sombra, esquinas grandes
  txItem: {
    flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 20,
    marginBottom: 8, gap: 12,
  },
  txIconWrap: { width: 46, height: 46, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },

  // Empty state
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, paddingBottom: 40 },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14, paddingBottom: 30,
  },
  footerHalf: { flex: 1, alignItems: 'center' },
  footerDivider: { width: StyleSheet.hairlineWidth, height: 36, marginHorizontal: 8 },
  addBtn: {
    width: 48, height: 48, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center', marginLeft: 12,
  },
});

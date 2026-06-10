import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity,
  TextInput, Pressable, Animated,
} from 'react-native';
import { useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Transaction } from '../../types/finance';

// ── Animated list item ─────────────────────────────────────────────────────────
function TxItem({ item, index, formatMoney, TEXT, TEXT2, CARD, BORDER, GREEN, RED }: any) {
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

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <Pressable
        style={({ pressed }) => [
          styles.txItem,
          { backgroundColor: CARD, borderColor: BORDER, opacity: pressed ? 0.75 : 1 }
        ]}
        onPress={() => Haptics.selectionAsync()}
      >
        <View style={[styles.txIconWrap, { backgroundColor: `${item.categories?.color || '#999'}18` }]}>
          <Ionicons name={getValidIcon(item.categories?.icon)} size={22} color={item.categories?.color || '#999'} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.txDesc, { color: TEXT }]} numberOfLines={1}>{item.description}</Text>
          <Text style={[styles.txCat, { color: TEXT2 }]}>{item.categories?.name || 'Sin categoría'}</Text>
        </View>
        <Text style={[styles.txAmount, { color: isIncome ? GREEN : RED }]}>
          {isIncome ? '+' : '-'}{formatMoney(item.amount)}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export default function TransactionsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  const [date, setDate] = useState(new Date());
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'todos' | 'ingreso' | 'gasto'>('todos');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const BG = isDark ? '#0F0F0F' : '#F4F6FB';
  const CARD = isDark ? '#1C1C1E' : '#FFFFFF';
  const TEXT = isDark ? '#F2F2F7' : '#1C1C1E';
  const TEXT2 = isDark ? '#8E8E93' : '#6C6C70';
  const BORDER = isDark ? '#2C2C2E' : '#E5E5EA';
  const GREEN = '#34C759';
  const RED = '#FF3B30';
  const BLUE = '#007AFF';

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
      // Calculate last day of month correctly
      const lastDay = new Date(currentYear, currentMonth, 0).getDate();
      const endDate = `${currentYear}-${pad(currentMonth)}-${pad(lastDay)}`;

      console.log('[Transactions] Fetching:', startDate, 'to', endDate);

      const { data, error } = await supabase
        .from('transactions')
        .select(`*, categories(name, icon, color)`)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false });

      if (error) {
        console.error('[Transactions] Supabase error:', error.message);
      } else {
        console.log('[Transactions] Fetched:', data?.length, 'records');
      }
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

  const filtered = transactions.filter(t => {
    if (typeFilter !== 'todos' && t.type !== typeFilter) return false;
    if (search && !t.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalIngresos = filtered.filter(t => t.type === 'ingreso').reduce((s, t) => s + t.amount, 0);
  const totalGastos = filtered.filter(t => t.type === 'gasto').reduce((s, t) => s + t.amount, 0);

  // Group by date
  const grouped: Record<string, typeof filtered> = {};
  filtered.forEach(t => {
    if (!grouped[t.date]) grouped[t.date] = [];
    grouped[t.date].push(t);
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
    <View style={[styles.screen, { backgroundColor: BG }]}>
      {/* ── Sticky Header ── */}
      <View style={[styles.header, { backgroundColor: CARD, borderBottomColor: BORDER }]}>
        {/* Month nav */}
        <View style={styles.monthNav}>
          <Pressable
            onPress={() => navigateMonth(-1)}
            style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.5 : 1 }]}
          >
            <Ionicons name="chevron-back" size={22} color={TEXT} />
          </Pressable>
          <Text style={[styles.headerMonth, { color: TEXT }]}>{capitalizedMonth}</Text>
          <Pressable
            onPress={() => navigateMonth(1)}
            style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.5 : 1 }]}
          >
            <Ionicons name="chevron-forward" size={22} color={TEXT} />
          </Pressable>
        </View>

        {/* Search */}
        <View style={[styles.searchBox, { backgroundColor: isDark ? '#2C2C2E' : '#F2F2F7', borderColor: BORDER }]}>
          <Ionicons name="search" size={18} color={TEXT2} />
          <TextInput
            style={[styles.searchInput, { color: TEXT }]}
            placeholder="Buscar transacción..."
            placeholderTextColor={TEXT2}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={TEXT2} />
            </Pressable>
          )}
        </View>

        {/* Filter chips */}
        <View style={styles.filterRow}>
          {FILTERS.map(f => {
            const active = typeFilter === f;
            const chipColor = f === 'ingreso' ? GREEN : f === 'gasto' ? RED : BLUE;
            return (
              <Pressable
                key={f}
                style={[
                  styles.chip,
                  { backgroundColor: active ? chipColor : isDark ? '#2C2C2E' : '#F2F2F7' }
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setTypeFilter(f);
                }}
              >
                <Text style={[styles.chipText, { color: active ? '#FFF' : TEXT2 }]}>
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
            <Ionicons name="receipt-outline" size={56} color={TEXT2} style={{ opacity: 0.4 }} />
            <Text style={[styles.emptyTitle, { color: TEXT }]}>Sin transacciones</Text>
            <Text style={[styles.emptySubtitle, { color: TEXT2 }]}>
              No hay movimientos en {capitalizedMonth.toLowerCase()}
            </Text>
          </View>
        ) : (
          Object.entries(grouped).map(([dateStr, items], gIdx) => (
            <View key={dateStr} style={styles.dayGroup}>
              <View style={styles.dayHeaderRow}>
                <Text style={[styles.dayLabel, { color: TEXT2 }]}>{formatDate(dateStr)}</Text>
                <View style={[styles.dayDivider, { backgroundColor: BORDER }]} />
              </View>
              {items.map((t, idx) => (
                <TxItem
                  key={t.id}
                  item={t}
                  index={gIdx * 10 + idx}
                  formatMoney={formatMoney}
                  TEXT={TEXT} TEXT2={TEXT2} CARD={CARD} BORDER={BORDER} GREEN={GREEN} RED={RED}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>

      {/* ── Footer totals ── */}
      <View style={[styles.footer, { backgroundColor: CARD, borderTopColor: BORDER }]}>
        <View style={styles.footerHalf}>
          <Text style={[styles.footerLabel, { color: TEXT2 }]}>Ingresos</Text>
          <Text style={[styles.footerAmt, { color: GREEN }]}>{formatMoney(totalIngresos)}</Text>
        </View>
        <View style={[styles.footerDivider, { backgroundColor: BORDER }]} />
        <View style={styles.footerHalf}>
          <Text style={[styles.footerLabel, { color: TEXT2 }]}>Gastos</Text>
          <Text style={[styles.footerAmt, { color: RED }]}>{formatMoney(totalGastos)}</Text>
        </View>
        <Pressable
          style={[styles.addBtn, { backgroundColor: BLUE }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push('/transaction/new');
          }}
        >
          <Ionicons name="add" size={24} color="#FFF" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  // Header
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  monthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  navBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerMonth: { fontSize: 18, fontWeight: '700' },

  // Search
  searchBox: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
    height: 42, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, marginBottom: 12, gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15 },

  // Filter chips
  filterRow: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  chipText: { fontSize: 14, fontWeight: '600' },

  // Day group
  dayGroup: { paddingHorizontal: 20, paddingTop: 20 },
  dayHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  dayLabel: { fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
  dayDivider: { flex: 1, height: StyleSheet.hairlineWidth },

  // Transaction item
  txItem: {
    flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth, marginBottom: 8, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  txIconWrap: { width: 46, height: 46, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  txDesc: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  txCat: { fontSize: 13 },
  txAmount: { fontSize: 16, fontWeight: '700' },

  // Empty state
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, paddingBottom: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptySubtitle: { fontSize: 14, textAlign: 'center' },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14, paddingBottom: 30,
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 8,
  },
  footerHalf: { flex: 1, alignItems: 'center' },
  footerLabel: { fontSize: 12, fontWeight: '500', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  footerAmt: { fontSize: 18, fontWeight: '800' },
  footerDivider: { width: StyleSheet.hairlineWidth, height: 36, marginHorizontal: 8 },
  addBtn: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center', marginLeft: 12,
    shadowColor: '#007AFF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
});

import React, { useState, useCallback } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { MonthlySummary } from '../../types/finance';
import { useAppTheme } from '@/theme';

export default function SummaryScreen() {
  const t = useAppTheme();
  const c = t.colors;

  const [year, setYear] = useState(new Date().getFullYear());
  const [summaries, setSummaries] = useState<MonthlySummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('monthly_summary').select('*').eq('year', year).order('month');
      if (error) throw error;
      setSummaries(data || []);
    } catch (e) {
      console.error('Error fetching summary:', e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [year])
  );

  const navigateYear = (dir: -1 | 1) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setYear(y => y + dir);
  };

  const formatMoney = (amount: number) => '$' + Math.round(amount).toLocaleString('es-CL');

  const getMonthName = (m: number) => {
    const d = new Date(); d.setMonth(m - 1);
    const name = d.toLocaleString('es-ES', { month: 'short' });
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  const fullYearData = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const existing = summaries.find(s => s.month === month);
    return existing || { year, month, total_income: 0, total_expenses: 0, balance: 0, savings_pct: 0 };
  });

  const maxIncome = Math.max(...fullYearData.map(s => s.total_income), 1);
  const maxExpense = Math.max(...fullYearData.map(s => s.total_expenses), 1);
  const maxVal = Math.max(maxIncome, maxExpense);

  const totalYearIncome = fullYearData.reduce((s, d) => s + d.total_income, 0);
  const totalYearExpense = fullYearData.reduce((s, d) => s + d.total_expenses, 0);
  const totalYearBalance = totalYearIncome - totalYearExpense;

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigateYear(-1)} style={[styles.navBtn, { backgroundColor: t.elevation[3] }]}>
          <Ionicons name="chevron-back" size={22} color={c.onSurface} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerLabel, { color: c.onSurfaceVariant }]}>Resumen anual</Text>
          <Text style={[t.type.titleLarge, { color: c.onSurface }]}>{year}</Text>
        </View>
        <TouchableOpacity onPress={() => navigateYear(1)} style={[styles.navBtn, { backgroundColor: t.elevation[3] }]}>
          <Ionicons name="chevron-forward" size={22} color={c.onSurface} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={c.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

          {/* ── Yearly Totals Hero (primaryContainer) ── */}
          <View style={[styles.heroCard, { backgroundColor: c.primaryContainer }]}>
            <Text style={[t.type.labelLarge, { color: c.onPrimaryContainer, opacity: 0.85 }]}>Balance neto anual</Text>
            <Text style={[t.type.displaySmall, { color: totalYearBalance >= 0 ? c.onPrimaryContainer : c.expense, fontWeight: '700', marginVertical: 6 }]}>
              {formatMoney(totalYearBalance)}
            </Text>
            <View style={styles.heroRow}>
              <View>
                <Text style={[t.type.labelMedium, { color: c.onPrimaryContainer, opacity: 0.8, textTransform: 'uppercase' }]}>Ingresos</Text>
                <Text style={[t.type.titleMedium, { color: c.onPrimaryContainer, fontWeight: '700' }]}>+{formatMoney(totalYearIncome)}</Text>
              </View>
              <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: c.onPrimaryContainer + '33' }} />
              <View>
                <Text style={[t.type.labelMedium, { color: c.onPrimaryContainer, opacity: 0.8, textTransform: 'uppercase' }]}>Gastos</Text>
                <Text style={[t.type.titleMedium, { color: c.onPrimaryContainer, fontWeight: '700' }]}>-{formatMoney(totalYearExpense)}</Text>
              </View>
            </View>
          </View>

          {/* ── Bar Chart ── */}
          <View style={[styles.card, { backgroundColor: t.elevation[1] }]}>
            <Text style={[t.type.titleMedium, { color: c.onSurface, marginBottom: 20 }]}>Ingresos vs gastos</Text>
            <View style={[styles.chart, { borderBottomColor: c.outlineVariant }]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chartScroll}>
                {fullYearData.map(s => {
                  const hIncome = s.total_income === 0 ? 4 : (s.total_income / maxVal) * 100;
                  const hExpense = s.total_expenses === 0 ? 4 : (s.total_expenses / maxVal) * 100;
                  return (
                    <View key={s.month} style={styles.chartCol}>
                      <View style={styles.barsArea}>
                        <View style={[styles.bar, { height: `${hIncome}%`, backgroundColor: c.income }]} />
                        <View style={[styles.bar, { height: `${hExpense}%`, backgroundColor: c.expense }]} />
                      </View>
                      <Text style={[t.type.labelMedium, { color: c.onSurfaceVariant, marginTop: 8 }]}>{getMonthName(s.month)}</Text>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
            <View style={styles.chartLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: c.income }]} />
                <Text style={[t.type.bodyMedium, { color: c.onSurfaceVariant }]}>Ingresos</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: c.expense }]} />
                <Text style={[t.type.bodyMedium, { color: c.onSurfaceVariant }]}>Gastos</Text>
              </View>
            </View>
          </View>

          {/* ── Monthly Table ── */}
          <View style={[styles.card, { backgroundColor: t.elevation[1], paddingHorizontal: 0, paddingBottom: 0 }]}>
            <View style={[styles.tableHeader, { backgroundColor: t.elevation[3] }]}>
              <Text style={[styles.thCell, { color: c.onSurfaceVariant, flex: 0.8 }]}>Mes</Text>
              <Text style={[styles.thCell, { color: c.onSurfaceVariant }]}>Ingresos</Text>
              <Text style={[styles.thCell, { color: c.onSurfaceVariant }]}>Gastos</Text>
              <Text style={[styles.thCell, { color: c.onSurfaceVariant, flex: 0.8 }]}>Bal.</Text>
            </View>
            {fullYearData.map((s, idx) => {
              const hasData = s.total_income > 0 || s.total_expenses > 0;
              return (
                <View key={s.month} style={[styles.tableRow, { borderBottomColor: c.outlineVariant, borderBottomWidth: idx === 11 ? 0 : StyleSheet.hairlineWidth }]}>
                  <Text style={[styles.tdCell, t.type.bodyMedium, { color: c.onSurface, flex: 0.8, fontWeight: '600' }]}>
                    {getMonthName(s.month)}
                  </Text>
                  {hasData ? (
                    <>
                      <Text style={[styles.tdCell, t.type.bodyMedium, { color: c.onSurface }]}>{formatMoney(s.total_income)}</Text>
                      <Text style={[styles.tdCell, t.type.bodyMedium, { color: c.onSurface }]}>{formatMoney(s.total_expenses)}</Text>
                      <Text style={[styles.tdCell, t.type.bodyMedium, { color: s.balance >= 0 ? c.income : c.expense, flex: 0.8, fontWeight: '700' }]}>
                        {s.balance > 0 ? '+' : ''}{Math.round(s.balance / 1000)}k
                      </Text>
                    </>
                  ) : (
                    <Text style={[styles.tdEmpty, t.type.bodySmall, { color: c.onSurfaceVariant }]}>Sin movimientos</Text>
                  )}
                </View>
              );
            })}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
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

  container: { flex: 1, paddingHorizontal: 20 },

  // Hero — shape.xl
  heroCard: { borderRadius: 28, padding: 24, marginBottom: 16 },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },

  // Card
  card: { borderRadius: 24, padding: 20, marginBottom: 16 },

  // Chart
  chart: { height: 180, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 8 },
  chartScroll: { paddingRight: 20, gap: 8 },
  chartCol: { alignItems: 'center', width: 44, height: '100%' },
  barsArea: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 4, width: '100%' },
  bar: { width: 12, borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  chartLegend: { flexDirection: 'row', justifyContent: 'center', marginTop: 16, gap: 20 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 999 },

  // Table
  tableHeader: { flexDirection: 'row', padding: 14, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  thCell: { flex: 1, fontSize: 12, fontWeight: '700', textAlign: 'right', textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14 },
  tdCell: { flex: 1, textAlign: 'right' },
  tdEmpty: { flex: 2.8, textAlign: 'center', fontStyle: 'italic' },
});

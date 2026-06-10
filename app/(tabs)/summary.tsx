import React, { useState, useCallback } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { MonthlySummary } from '../../types/finance';

export default function SummaryScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [year, setYear] = useState(new Date().getFullYear());
  const [summaries, setSummaries] = useState<MonthlySummary[]>([]);
  const [loading, setLoading] = useState(true);

  const BG = isDark ? '#0F0F0F' : '#F4F6FB';
  const CARD = isDark ? '#1C1C1E' : '#FFFFFF';
  const TEXT = isDark ? '#F2F2F7' : '#1C1C1E';
  const TEXT2 = isDark ? '#8E8E93' : '#6C6C70';
  const BORDER = isDark ? '#2C2C2E' : '#E5E5EA';
  const GREEN = '#34C759';
  const RED = '#FF3B30';
  const BLUE = '#007AFF';

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('monthly_summary')
        .select('*')
        .eq('year', year)
        .order('month');
      
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

  // Enforce array of 12 months for visual consistency, even if no data
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
    <View style={[styles.screen, { backgroundColor: BG }]}>
      
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigateYear(-1)} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={22} color={TEXT} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerLabel, { color: TEXT2 }]}>Resumen Anual</Text>
          <Text style={[styles.headerYear, { color: TEXT }]}>{year}</Text>
        </View>
        <TouchableOpacity onPress={() => navigateYear(1)} style={styles.navBtn}>
          <Ionicons name="chevron-forward" size={22} color={TEXT} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={BLUE} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
          
          {/* ── Yearly Totals Hero ── */}
          <View style={[styles.heroCard, { backgroundColor: BLUE }]}>
            <Text style={styles.heroLabel}>Balance Neto Anual</Text>
            <Text style={[styles.heroAmount, { color: totalYearBalance >= 0 ? '#FFF' : '#FFD6D6' }]}>
              {formatMoney(totalYearBalance)}
            </Text>
            <View style={styles.heroRow}>
              <View>
                <Text style={styles.heroSubLabel}>Ingresos</Text>
                <Text style={styles.heroSubAmount}>+{formatMoney(totalYearIncome)}</Text>
              </View>
              <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.3)' }} />
              <View>
                <Text style={styles.heroSubLabel}>Gastos</Text>
                <Text style={styles.heroSubAmount}>-{formatMoney(totalYearExpense)}</Text>
              </View>
            </View>
          </View>

          {/* ── Bar Chart ── */}
          <View style={[styles.card, { backgroundColor: CARD, borderColor: BORDER }]}>
            <Text style={[styles.sectionTitle, { color: TEXT }]}>Ingresos vs Gastos</Text>
            <View style={styles.chart}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chartScroll}>
                {fullYearData.map(s => {
                  const hIncome = s.total_income === 0 ? 4 : (s.total_income / maxVal) * 100;
                  const hExpense = s.total_expenses === 0 ? 4 : (s.total_expenses / maxVal) * 100;
                  return (
                    <View key={s.month} style={styles.chartCol}>
                      <View style={styles.barsArea}>
                        <View style={[styles.bar, { height: `${hIncome}%`, backgroundColor: GREEN }]} />
                        <View style={[styles.bar, { height: `${hExpense}%`, backgroundColor: RED }]} />
                      </View>
                      <Text style={[styles.chartMonth, { color: TEXT2 }]}>{getMonthName(s.month)}</Text>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
            <View style={styles.chartLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: GREEN }]} />
                <Text style={{ color: TEXT2, fontSize: 13, fontWeight: '500' }}>Ingresos</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: RED }]} />
                <Text style={{ color: TEXT2, fontSize: 13, fontWeight: '500' }}>Gastos</Text>
              </View>
            </View>
          </View>

          {/* ── Monthly Table ── */}
          <View style={[styles.card, { backgroundColor: CARD, borderColor: BORDER, paddingHorizontal: 0, paddingBottom: 0 }]}>
            <View style={[styles.tableHeader, { backgroundColor: isDark ? '#2C2C2E' : '#F2F2F7', borderBottomColor: BORDER }]}>
              <Text style={[styles.thCell, { color: TEXT2, flex: 0.8 }]}>Mes</Text>
              <Text style={[styles.thCell, { color: TEXT2 }]}>Ingresos</Text>
              <Text style={[styles.thCell, { color: TEXT2 }]}>Gastos</Text>
              <Text style={[styles.thCell, { color: TEXT2, flex: 0.8 }]}>Bal.</Text>
            </View>
            {fullYearData.map((s, idx) => {
              const hasData = s.total_income > 0 || s.total_expenses > 0;
              return (
                <View key={s.month} style={[styles.tableRow, { borderBottomColor: BORDER, borderBottomWidth: idx === 11 ? 0 : StyleSheet.hairlineWidth }]}>
                  <Text style={[styles.tdCell, { color: TEXT, flex: 0.8, fontWeight: '600' }]}>
                    {getMonthName(s.month)}
                  </Text>
                  {hasData ? (
                    <>
                      <Text style={[styles.tdCell, { color: TEXT }]}>{formatMoney(s.total_income)}</Text>
                      <Text style={[styles.tdCell, { color: TEXT }]}>{formatMoney(s.total_expenses)}</Text>
                      <Text style={[styles.tdCell, { color: s.balance >= 0 ? GREEN : RED, flex: 0.8, fontWeight: '700' }]}>
                        {s.balance > 0 ? '+' : ''}{Math.round(s.balance / 1000)}k
                      </Text>
                    </>
                  ) : (
                    <Text style={[styles.tdEmpty, { color: TEXT2 }]}>Sin movimientos</Text>
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
  headerYear: { fontSize: 20, fontWeight: '700', marginTop: 2 },
  
  container: { flex: 1, paddingHorizontal: 20 },
  
  // Hero
  heroCard: {
    borderRadius: 20, padding: 24, marginBottom: 16,
    shadowColor: '#007AFF', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8,
  },
  heroLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  heroAmount: { fontSize: 36, fontWeight: '800', letterSpacing: -1, marginBottom: 20 },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between' },
  heroSubLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  heroSubAmount: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  // Card
  card: {
    borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 20 },

  // Chart
  chart: { height: 180, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.1)', paddingBottom: 8 },
  chartScroll: { paddingRight: 20, gap: 8 },
  chartCol: { alignItems: 'center', width: 44, height: '100%' },
  barsArea: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 4, width: '100%' },
  bar: { width: 12, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  chartMonth: { marginTop: 8, fontSize: 12, fontWeight: '500' },
  chartLegend: { flexDirection: 'row', justifyContent: 'center', marginTop: 16, gap: 20 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },

  // Table
  tableHeader: { flexDirection: 'row', padding: 14, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  thCell: { flex: 1, fontSize: 12, fontWeight: '700', textAlign: 'right', textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14 },
  tdCell: { flex: 1, fontSize: 14, textAlign: 'right', fontWeight: '500' },
  tdEmpty: { flex: 2.8, fontSize: 13, textAlign: 'center', fontStyle: 'italic' },
});

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { useAppTheme } from '@/theme';
import { CategoryDonut, DonutSegment } from '@/components/charts/CategoryDonut';

interface TxLite {
  id: string;
  date: string;
  amount: number;
  description: string;
}
interface CatStat {
  id: string;
  name: string;
  icon: string;
  color: string;
  total: number;
  count: number;
  pct: number;
  budget: number;
  txs: TxLite[];
}

// Paleta de respaldo si una categoría no tiene color en BD.
const FALLBACK_PALETTE = ['#4C8DF5', '#E2A33B', '#1CA37E', '#D9534F', '#9B6BDF', '#E0699F', '#3CB1C8', '#C5713B'];

const getValidIcon = (name: string): any => {
  const map: Record<string, string> = {
    'dots-horizontal': 'ellipsis-horizontal',
    'credit-card': 'card-outline',
    'wrench': 'build-outline',
  };
  return map[name] || name || 'ellipse-outline';
};

export default function AnalyticsScreen() {
  const t = useAppTheme();
  const c = t.colors;
  const router = useRouter();

  const [date, setDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<CatStat[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const monthName = date.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
  const capMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  const fetchData = async () => {
    try {
      setLoading(true);
      const pad = (n: number) => n.toString().padStart(2, '0');
      const start = `${year}-${pad(month)}-01`;
      const end = `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`;

      const [{ data: txData }, { data: budgetData }] = await Promise.all([
        supabase
          .from('transactions')
          .select('id, date, amount, type, category_id, description, categories(name, icon, color)')
          .eq('type', 'gasto')
          .gte('date', start)
          .lte('date', end)
          .order('date', { ascending: false }),
        supabase.from('budgets').select('category_id, amount').eq('year', year).eq('month', month),
      ]);

      const txs = txData || [];
      const budgets = budgetData || [];

      const map = new Map<string, CatStat>();
      let sum = 0;
      let pi = 0;
      for (const tx of txs as any[]) {
        const id = tx.category_id || 'sin';
        const cat = tx.categories;
        sum += Number(tx.amount);
        if (!map.has(id)) {
          map.set(id, {
            id,
            name: cat?.name || 'Sin categoría',
            icon: cat?.icon || 'ellipse-outline',
            color: cat?.color || FALLBACK_PALETTE[pi++ % FALLBACK_PALETTE.length],
            total: 0, count: 0, pct: 0, budget: 0, txs: [],
          });
        }
        const s = map.get(id)!;
        s.total += Number(tx.amount);
        s.count += 1;
        if (s.txs.length < 6) s.txs.push({ id: tx.id, date: tx.date, amount: Number(tx.amount), description: tx.description });
      }
      for (const b of budgets as any[]) {
        const s = map.get(b.category_id);
        if (s) s.budget = Number(b.amount);
      }
      const arr = Array.from(map.values()).sort((a, b) => b.total - a.total);
      arr.forEach(s => { s.pct = sum > 0 ? (s.total / sum) * 100 : 0; });

      setStats(arr);
      setTotal(sum);
      // Conserva la selección si la categoría sigue existiendo
      setSelected(prev => (prev && arr.some(s => s.id === prev) ? prev : null));
    } catch (e) {
      console.error('[Analytics] error', e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, [year, month]));

  const navigateMonth = (dir: -1 | 1) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected(null);
    setDate(d => new Date(d.getFullYear(), d.getMonth() + dir, 1));
  };

  const formatMoney = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');

  const segments: DonutSegment[] = stats.map(s => ({ key: s.id, label: s.name, value: s.total, color: s.color }));
  const sel = stats.find(s => s.id === selected) || null;

  const centerPrimary = sel ? `${Math.round(sel.pct)}%` : formatMoney(total);
  const centerSecondary = sel ? sel.name : 'Gastado';

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => { Haptics.selectionAsync(); router.back(); }}
          style={({ pressed }) => [styles.iconBtn, { backgroundColor: t.elevation[3], opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="arrow-back" size={22} color={c.onSurface} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.headerLabel, { color: c.onSurfaceVariant }]}>Análisis por categoría</Text>
          <Text style={[t.type.titleLarge, { color: c.onSurface }]}>{capMonth}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={() => navigateMonth(-1)} style={({ pressed }) => [styles.iconBtn, { backgroundColor: t.elevation[3], opacity: pressed ? 0.6 : 1 }]}>
            <Ionicons name="chevron-back" size={20} color={c.onSurface} />
          </Pressable>
          <Pressable onPress={() => navigateMonth(1)} style={({ pressed }) => [styles.iconBtn, { backgroundColor: t.elevation[3], opacity: pressed ? 0.6 : 1 }]}>
            <Ionicons name="chevron-forward" size={20} color={c.onSurface} />
          </Pressable>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={c.primary} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Donut card */}
          <View style={[styles.donutCard, { backgroundColor: c.primaryContainer }]}>
            <CategoryDonut
              data={segments}
              size={250}
              thickness={40}
              selectedKey={selected}
              onSelect={setSelected}
              centerPrimary={centerPrimary}
              centerSecondary={centerSecondary}
            />
            <Text style={[t.type.bodySmall, { color: c.onPrimaryContainer, opacity: 0.8, marginTop: 8 }]}>
              {selected ? 'Toca el sector de nuevo para volver al total' : 'Toca un sector para ver el detalle'}
            </Text>
          </View>

          {/* Drill-down: detalle de la categoría seleccionada */}
          {sel ? (
            <CategoryDetail stat={sel} formatMoney={formatMoney} />
          ) : (
            /* Leyenda / lista de categorías */
            <View style={{ paddingHorizontal: 20, gap: 10, marginTop: 4 }}>
              {stats.length === 0 && (
                <View style={[styles.emptyCard, { backgroundColor: t.elevation[1] }]}>
                  <Ionicons name="pie-chart-outline" size={40} color={c.onSurfaceVariant} style={{ opacity: 0.6 }} />
                  <Text style={[t.type.titleMedium, { color: c.onSurface }]}>Sin gastos este mes</Text>
                  <Text style={[t.type.bodyMedium, { color: c.onSurfaceVariant, textAlign: 'center' }]}>
                    Registra movimientos para ver el análisis por categoría.
                  </Text>
                </View>
              )}
              {stats.map(s => (
                <Pressable
                  key={s.id}
                  onPress={() => { Haptics.selectionAsync(); setSelected(s.id); }}
                  style={({ pressed }) => [styles.legendRow, { backgroundColor: t.elevation[1], opacity: pressed ? 0.85 : 1 }]}
                >
                  <View style={[styles.dot, { backgroundColor: s.color }]} />
                  <View style={[styles.legendIcon, { backgroundColor: s.color + '22' }]}>
                    <Ionicons name={getValidIcon(s.icon)} size={18} color={s.color} />
                  </View>
                  <Text style={[t.type.titleMedium, { color: c.onSurface, flex: 1 }]} numberOfLines={1}>{s.name}</Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[t.type.titleMedium, { color: c.onSurface }]}>{formatMoney(s.total)}</Text>
                    <Text style={[t.type.labelMedium, { color: c.onSurfaceVariant }]}>{s.pct.toFixed(1)}%</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ── Panel de detalle (drill-down) ────────────────────────────────────────────
function CategoryDetail({ stat, formatMoney }: { stat: CatStat; formatMoney: (n: number) => string }) {
  const t = useAppTheme();
  const c = t.colors;
  const avg = stat.count > 0 ? stat.total / stat.count : 0;
  const hasBudget = stat.budget > 0;
  const pctBudget = hasBudget ? (stat.total / stat.budget) * 100 : 0;
  const over = hasBudget && stat.total > stat.budget;
  const budgetColor = over ? c.expense : pctBudget >= 85 ? c.warning : c.income;

  const fmtDate = (d: string) => {
    const dd = new Date(d + 'T12:00:00');
    return dd.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
  };

  return (
    <View style={{ paddingHorizontal: 20, gap: 12, marginTop: 4 }}>
      {/* Encabezado categoría */}
      <View style={[styles.detailHeader, { backgroundColor: t.elevation[1] }]}>
        <View style={[styles.detailIcon, { backgroundColor: stat.color + '22' }]}>
          <Ionicons name={getValidIcon(stat.icon)} size={26} color={stat.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[t.type.titleLarge, { color: c.onSurface }]}>{stat.name}</Text>
          <Text style={[t.type.bodyMedium, { color: c.onSurfaceVariant }]}>{stat.pct.toFixed(1)}% del gasto del mes</Text>
        </View>
        <Text style={[t.type.titleLarge, { color: c.onSurface, fontWeight: '700' }]}>{formatMoney(stat.total)}</Text>
      </View>

      {/* Métricas */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={[styles.metric, { backgroundColor: t.elevation[1] }]}>
          <Text style={[t.type.labelMedium, { color: c.onSurfaceVariant }]}>Movimientos</Text>
          <Text style={[t.type.headlineSmall, { color: c.onSurface }]}>{stat.count}</Text>
        </View>
        <View style={[styles.metric, { backgroundColor: t.elevation[1] }]}>
          <Text style={[t.type.labelMedium, { color: c.onSurfaceVariant }]}>Promedio</Text>
          <Text style={[t.type.headlineSmall, { color: c.onSurface }]}>{formatMoney(avg)}</Text>
        </View>
      </View>

      {/* Presupuesto */}
      {hasBudget && (
        <View style={[styles.budgetCard, { backgroundColor: t.elevation[1] }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={[t.type.titleSmall, { color: c.onSurface }]}>Presupuesto</Text>
            <Text style={[t.type.titleSmall, { color: budgetColor }]}>{Math.round(pctBudget)}%</Text>
          </View>
          <View style={[styles.track, { backgroundColor: c.surfaceVariant }]}>
            <View style={{ width: `${Math.min(pctBudget, 100)}%`, height: '100%', borderRadius: 999, backgroundColor: budgetColor }} />
          </View>
          <Text style={[t.type.bodyMedium, { color: c.onSurfaceVariant, marginTop: 8 }]}>
            <Text style={{ color: c.onSurface, fontWeight: '600' }}>{formatMoney(stat.total)}</Text>
            {' de '}{formatMoney(stat.budget)}
            {over
              ? `  ·  excedido ${formatMoney(stat.total - stat.budget)}`
              : `  ·  disponible ${formatMoney(stat.budget - stat.total)}`}
          </Text>
        </View>
      )}

      {/* Últimos movimientos */}
      <Text style={[t.type.titleMedium, { color: c.onSurface, marginTop: 6, marginLeft: 4 }]}>Últimos movimientos</Text>
      <View style={[styles.txList, { backgroundColor: t.elevation[1] }]}>
        {stat.txs.map((tx, i) => (
          <View
            key={tx.id}
            style={[styles.txRow, i < stat.txs.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.outlineVariant }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[t.type.bodyLarge, { color: c.onSurface }]} numberOfLines={1}>{tx.description}</Text>
              <Text style={[t.type.labelMedium, { color: c.onSurfaceVariant }]}>{fmtDate(tx.date)}</Text>
            </View>
            <Text style={[t.type.titleMedium, { color: c.onSurface }]}>{formatMoney(tx.amount)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
  },
  headerLabel: { fontSize: 11, fontWeight: '500', letterSpacing: 0.5, textTransform: 'uppercase' },
  iconBtn: { width: 40, height: 40, borderRadius: 999, justifyContent: 'center', alignItems: 'center' },

  donutCard: { marginHorizontal: 20, marginBottom: 16, borderRadius: 28, padding: 24, alignItems: 'center' },

  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, padding: 14 },
  dot: { width: 10, height: 10, borderRadius: 999 },
  legendIcon: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

  emptyCard: { alignItems: 'center', justifyContent: 'center', gap: 8, padding: 28, borderRadius: 28 },

  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 24, padding: 16 },
  detailIcon: { width: 52, height: 52, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },

  metric: { flex: 1, borderRadius: 24, padding: 16, gap: 6 },

  budgetCard: { borderRadius: 24, padding: 16 },
  track: { height: 8, borderRadius: 999, overflow: 'hidden' },

  txList: { borderRadius: 24, paddingHorizontal: 16 },
  txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
});

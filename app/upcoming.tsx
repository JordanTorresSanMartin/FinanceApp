import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  StyleSheet, View, Text, ScrollView, Pressable,
  ActivityIndicator, Alert, RefreshControl,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';
import { Installment, Statement, ForecastMonth } from '../types/finance';
import { useAppTheme } from '@/theme';

const MONTHS_ES: Record<string, string> = {
  ENERO: 'Ene', FEBRERO: 'Feb', MARZO: 'Mar', ABRIL: 'Abr', MAYO: 'May', JUNIO: 'Jun',
  JULIO: 'Jul', AGOSTO: 'Ago', SEPTIEMBRE: 'Sep', OCTUBRE: 'Oct', NOVIEMBRE: 'Nov', DICIEMBRE: 'Dic',
};

export default function UpcomingScreen() {
  const t = useAppTheme();
  const c = t.colors;
  const router = useRouter();

  const [statements, setStatements] = useState<Statement[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Modal de contraseña: BCI (y otros) entregan el PDF cifrado.
  const [pwVisible, setPwVisible] = useState(false);
  const [pwValue, setPwValue] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const pendingRef = useRef<{ b64: string; filename: string } | null>(null);

  const fetchData = async () => {
    try {
      const { data: stmts, error: sErr } = await supabase
        .from('statements').select('*').order('statement_date', { ascending: false });
      if (sErr) throw sErr;

      // Último estado de cuenta por banco (snapshot vigente de cada tarjeta).
      const latestByBank = new Map<string, Statement>();
      for (const s of stmts ?? []) {
        const key = s.bank ?? 'banco';
        if (!latestByBank.has(key)) latestByBank.set(key, s);
      }
      const latest = [...latestByBank.values()];
      setStatements(latest);

      if (latest.length === 0) {
        setInstallments([]);
        return;
      }

      const { data: insts, error: iErr } = await supabase
        .from('installments')
        .select('*, categories(name,icon,color), statements(bank,card_last4)')
        .in('statement_id', latest.map(s => s.id))
        .order('monthly_amount', { ascending: false });
      if (iErr) throw iErr;

      // Solo cuotas activas (todavía quedan pagos por delante).
      setInstallments((insts ?? []).filter(i => i.installment_current < i.installment_total));
    } catch (e) {
      console.error('Error fetching upcoming:', e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  // Envía el PDF (con contraseña opcional) a la Edge Function y refresca.
  const processPdf = async (b64: string, filename: string, password?: string) => {
    setUploading(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-statement', {
        body: { pdf_base64: b64, filename, ...(password ? { password } : {}) },
      });

      // supabase-js entrega el cuerpo en `data` para 2xx; en un no-2xx pone un
      // error genérico ("non-2xx") y esconde el cuerpo real en `error.context`.
      // Lo recuperamos para ver el mensaje/diagnóstico verdadero.
      let payload: any = data;
      if (error) {
        const ctx: any = (error as any).context;
        if (ctx && typeof ctx.json === 'function') payload = await ctx.json().catch(() => null);
        else if (ctx && typeof ctx.text === 'function') {
          const txt = await ctx.text().catch(() => '');
          try { payload = JSON.parse(txt); } catch { payload = txt ? { error: txt } : null; }
        }
        if (!payload) throw error;
      }

      if (!payload?.ok) {
        // PDF cifrado: pedir (o repedir) la contraseña sin perder el archivo.
        if (payload?.code === 'PASSWORD_REQUIRED' || payload?.code === 'PASSWORD_INCORRECT') {
          pendingRef.current = { b64, filename };
          setPwError(payload.code === 'PASSWORD_INCORRECT' ? 'Contraseña incorrecta. Inténtalo de nuevo.' : null);
          setPwVisible(true);
          return;
        }
        throw new Error(payload?.error || 'No se pudo procesar el PDF.');
      }

      // Éxito
      pendingRef.current = null;
      setPwVisible(false);
      setPwValue('');
      setPwError(null);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Estado de cuenta importado',
        `${payload.bank ?? 'Banco'}${payload.card_last4 ? ' ••' + payload.card_last4 : ''}\n` +
        `${payload.installments} compras en cuotas detectadas.`,
      );
      await fetchData();
    } catch (e: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', e?.message ?? 'No se pudo subir el estado de cuenta.');
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const b64 = await readAsStringAsync(asset.uri, { encoding: 'base64' });
      await processPdf(b64, asset.name);
    } catch (e: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', e?.message ?? 'No se pudo leer el PDF.');
    }
  };

  const submitPassword = () => {
    const pending = pendingRef.current;
    if (!pending || !pwValue.trim() || uploading) return;
    Haptics.selectionAsync();
    processPdf(pending.b64, pending.filename, pwValue.trim());
  };

  const cancelPassword = () => {
    setPwVisible(false);
    setPwValue('');
    setPwError(null);
    pendingRef.current = null;
  };

  const formatMoney = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');
  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
  };

  // ── Derivados ──
  const monthlyTotal = useMemo(
    () => installments.reduce((s, i) => s + Number(i.monthly_amount), 0),
    [installments],
  );
  const billedTotal = useMemo(
    () => statements.reduce((s, st) => s + Number(st.total_amount), 0),
    [statements],
  );
  const nextDue = useMemo(() => {
    const dates = statements.map(s => s.due_date).filter(Boolean) as string[];
    return dates.sort()[0] ?? null;
  }, [statements]);

  // Forecast combinado por mes (suma entre tarjetas, preservando orden).
  const forecast = useMemo<ForecastMonth[]>(() => {
    const order: string[] = [];
    const map = new Map<string, number>();
    for (const s of statements) {
      for (const f of s.forecast ?? []) {
        if (!map.has(f.month)) order.push(f.month);
        map.set(f.month, (map.get(f.month) ?? 0) + Number(f.amount));
      }
    }
    return order.map(month => ({ month, amount: map.get(month)! }));
  }, [statements]);
  const maxForecast = Math.max(...forecast.map(f => f.amount), 1);

  const bankShort = (bank?: string | null): string => {
    if (!bank) return 'Tarjeta';
    if (/falabella/i.test(bank)) return 'Falabella';
    if (/tenpo/i.test(bank)) return 'Tenpo';
    if (/bci/i.test(bank)) return 'BCI';
    return bank;
  };

  const getValidIcon = (name?: string): any => {
    const map: Record<string, string> = {
      'dots-horizontal': 'ellipsis-horizontal',
      'credit-card': 'card-outline',
      'wrench': 'build-outline',
    };
    return map[name ?? ''] || name || 'pricetag-outline';
  };

  const empty = !loading && statements.length === 0;

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable
          onPress={() => { Haptics.selectionAsync(); router.back(); }}
          style={({ pressed }) => [styles.navBtn, { backgroundColor: t.elevation[3], opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="chevron-back" size={22} color={c.onSurface} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerLabel, { color: c.onSurfaceVariant }]}>Compromisos</Text>
          <Text style={[t.type.titleLarge, { color: c.onSurface }]}>Próximos pagos</Text>
        </View>
        <Pressable
          onPress={handleUpload}
          disabled={uploading}
          style={({ pressed }) => [styles.navBtn, { backgroundColor: c.primaryContainer, opacity: pressed ? 0.6 : 1 }]}
        >
          {uploading
            ? <ActivityIndicator size="small" color={c.onPrimaryContainer} />
            : <Ionicons name="cloud-upload-outline" size={20} color={c.onPrimaryContainer} />}
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={c.primary} style={{ marginTop: 40 }} />
      ) : empty ? (
        <View style={styles.emptyWrap}>
          <View style={[styles.emptyCard, { backgroundColor: t.elevation[1] }]}>
            <Ionicons name="document-attach-outline" size={48} color={c.onSurfaceVariant} style={{ opacity: 0.6 }} />
            <Text style={[t.type.titleMedium, { color: c.onSurface, textAlign: 'center' }]}>
              Sube tu estado de cuenta
            </Text>
            <Text style={[t.type.bodyMedium, { color: c.onSurfaceVariant, textAlign: 'center' }]}>
              Importa el PDF de tu tarjeta de crédito y la app detectará tus
              compras en cuotas y próximos pagos. Si el PDF tiene contraseña,
              te la pediremos al subirlo.
            </Text>
            <Pressable
              onPress={handleUpload}
              disabled={uploading}
              style={({ pressed }) => [styles.uploadBtn, { backgroundColor: c.primary, opacity: pressed ? 0.85 : 1 }]}
            >
              {uploading
                ? <ActivityIndicator size="small" color={c.onPrimary} />
                : <Ionicons name="cloud-upload-outline" size={20} color={c.onPrimary} />}
              <Text style={[t.type.labelLarge, { color: c.onPrimary }]}>
                {uploading ? 'Procesando…' : 'Subir PDF'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        >
          {/* ── Hero: cuota mensual comprometida ── */}
          <View style={[styles.heroCard, { backgroundColor: c.primaryContainer }]}>
            <Text style={[t.type.labelLarge, { color: c.onPrimaryContainer, opacity: 0.85 }]}>
              Cuota mensual comprometida
            </Text>
            <Text style={[t.type.displayHero, { color: c.onPrimaryContainer, marginVertical: 6 }]}>
              {formatMoney(monthlyTotal)}
            </Text>
            <View style={[styles.heroPill, { backgroundColor: c.onPrimaryContainer + '1F' }]}>
              <Ionicons name="repeat" size={14} color={c.onPrimaryContainer} />
              <Text style={[t.type.labelMedium, { color: c.onPrimaryContainer }]}>
                {installments.length} compras en cuotas activas
              </Text>
            </View>
          </View>

          {/* ── Facturado / Vence ── */}
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: c.expenseContainer }]}>
              <Text style={[t.type.labelMedium, { color: c.onExpenseContainer, textTransform: 'uppercase' }]}>
                Facturado este mes
              </Text>
              <Text style={[t.type.titleLarge, { color: c.onExpenseContainer, letterSpacing: -0.3 }]}>
                {formatMoney(billedTotal)}
              </Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: t.elevation[2] }]}>
              <Text style={[t.type.labelMedium, { color: c.onSurfaceVariant, textTransform: 'uppercase' }]}>
                Próximo vencimiento
              </Text>
              <Text style={[t.type.titleLarge, { color: c.onSurface, letterSpacing: -0.3 }]}>
                {formatDate(nextDue)}
              </Text>
            </View>
          </View>

          {/* ── Forecast próximos meses ── */}
          {forecast.length > 0 && (
            <View style={[styles.card, { backgroundColor: t.elevation[1] }]}>
              <Text style={[t.type.titleMedium, { color: c.onSurface, marginBottom: 18 }]}>
                Vencimiento próximos meses
              </Text>
              <View style={styles.forecastRow}>
                {forecast.map(f => {
                  const h = Math.max((f.amount / maxForecast) * 90, 6);
                  return (
                    <View key={f.month} style={styles.forecastCol}>
                      <Text style={[t.type.labelSmall, { color: c.onSurfaceVariant, marginBottom: 6 }]}>
                        {Math.round(f.amount / 1000)}k
                      </Text>
                      <View style={[styles.forecastBar, { height: h, backgroundColor: c.primary }]} />
                      <Text style={[t.type.labelMedium, { color: c.onSurfaceVariant, marginTop: 8 }]}>
                        {MONTHS_ES[f.month] ?? f.month.slice(0, 3)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* ── Lista de cuotas ── */}
          <View style={styles.sectionHeader}>
            <Text style={[t.type.titleLarge, { color: c.onSurface }]}>Compras en cuotas</Text>
            <Text style={[t.type.bodyMedium, { color: c.onSurfaceVariant }]}>{installments.length}</Text>
          </View>

          <View style={{ gap: 10 }}>
            {installments.map(it => {
              const remaining = it.installment_total - it.installment_current;
              const pct = (it.installment_current / it.installment_total) * 100;
              const catColor = it.categories?.color || c.primary;
              const cardTag = it.statements?.card_last4
                ? `${bankShort(it.statements?.bank)} ••${it.statements.card_last4}`
                : bankShort(it.statements?.bank);
              return (
                <View key={it.id} style={[styles.instCard, { backgroundColor: t.elevation[1] }]}>
                  <View style={styles.instTop}>
                    <View style={[styles.instIcon, { backgroundColor: catColor + '22' }]}>
                      <Ionicons name={getValidIcon(it.categories?.icon)} size={20} color={catColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[t.type.titleMedium, { color: c.onSurface }]} numberOfLines={1}>
                        {it.description}
                      </Text>
                      <Text style={[t.type.bodySmall, { color: c.onSurfaceVariant }]} numberOfLines={1}>
                        {cardTag} · {it.categories?.name ?? 'Otros'} · Total {formatMoney(it.total_amount)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[t.type.titleMedium, { color: c.onSurface, fontWeight: '700' }]}>
                        {formatMoney(it.monthly_amount)}
                      </Text>
                      <Text style={[t.type.labelSmall, { color: c.onSurfaceVariant }]}>al mes</Text>
                    </View>
                  </View>

                  {/* Progreso de cuotas */}
                  <View style={styles.instBottom}>
                    <View style={[styles.progressBg, { backgroundColor: c.surfaceVariant }]}>
                      <View style={{ width: `${pct}%`, height: '100%', borderRadius: 999, backgroundColor: catColor }} />
                    </View>
                    <View style={[styles.instBadge, { backgroundColor: catColor + '1F' }]}>
                      <Text style={[t.type.labelMedium, { color: catColor }]}>
                        {remaining} {remaining === 1 ? 'cuota' : 'cuotas'} · {it.installment_current}/{it.installment_total}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Origen */}
          <Text style={[t.type.bodySmall, { color: c.onSurfaceVariant, textAlign: 'center', marginTop: 20, opacity: 0.7 }]}>
            {statements.map(s => `${s.bank ?? 'Banco'}${s.card_last4 ? ' ••' + s.card_last4 : ''}`).join('  ·  ')}
          </Text>
        </ScrollView>
      )}

      {/* ── Modal: contraseña del PDF ── */}
      <Modal visible={pwVisible} transparent animationType="fade" onRequestClose={cancelPassword}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { backgroundColor: t.elevation[3] }]}>
            <View style={[styles.modalIcon, { backgroundColor: c.primaryContainer }]}>
              <Ionicons name="lock-closed" size={22} color={c.onPrimaryContainer} />
            </View>
            <Text style={[t.type.titleLarge, { color: c.onSurface, textAlign: 'center' }]}>
              PDF protegido
            </Text>
            <Text style={[t.type.bodyMedium, { color: c.onSurfaceVariant, textAlign: 'center' }]}>
              Este estado de cuenta tiene contraseña. Ingrésala para leerlo
              (no se guarda en ningún lado).
            </Text>
            <TextInput
              value={pwValue}
              onChangeText={setPwValue}
              placeholder="Contraseña del PDF"
              placeholderTextColor={c.onSurfaceVariant}
              secureTextEntry
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={submitPassword}
              style={[styles.pwInput, {
                backgroundColor: t.elevation[1],
                color: c.onSurface,
                borderColor: pwError ? c.error : c.outlineVariant,
              }]}
            />
            {pwError && (
              <Text style={[t.type.bodySmall, { color: c.error, textAlign: 'center' }]}>{pwError}</Text>
            )}
            <View style={styles.modalActions}>
              <Pressable
                onPress={cancelPassword}
                style={({ pressed }) => [styles.modalBtn, { backgroundColor: t.elevation[1], opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={[t.type.labelLarge, { color: c.onSurface }]}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={submitPassword}
                disabled={uploading || !pwValue.trim()}
                style={({ pressed }) => [styles.modalBtn, {
                  backgroundColor: c.primary,
                  opacity: (uploading || !pwValue.trim()) ? 0.5 : (pressed ? 0.85 : 1),
                }]}
              >
                {uploading
                  ? <ActivityIndicator size="small" color={c.onPrimary} />
                  : <Text style={[t.type.labelLarge, { color: c.onPrimary }]}>Desbloquear</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
  },
  navBtn: { width: 44, height: 44, borderRadius: 999, justifyContent: 'center', alignItems: 'center' },
  headerCenter: { alignItems: 'center' },
  headerLabel: { fontSize: 11, fontWeight: '500', letterSpacing: 0.5, textTransform: 'uppercase' },

  // Hero
  heroCard: { borderRadius: 28, padding: 24, marginBottom: 14, marginTop: 4 },
  heroPill: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, gap: 4, marginTop: 8,
  },

  // Stats
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  statCard: { flex: 1, borderRadius: 24, padding: 16, gap: 6 },

  // Card genérica
  card: { borderRadius: 24, padding: 20, marginBottom: 14 },

  // Forecast
  forecastRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 130 },
  forecastCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  forecastBar: { width: 26, borderTopLeftRadius: 8, borderTopRightRadius: 8 },

  // Section header
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 14, marginBottom: 12,
  },

  // Installment card
  instCard: { borderRadius: 24, padding: 16, gap: 14 },
  instTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  instIcon: { width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  instBottom: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  progressBg: { flex: 1, height: 8, borderRadius: 999, overflow: 'hidden' },
  instBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },

  // Empty
  emptyWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
  emptyCard: { borderRadius: 28, padding: 32, alignItems: 'center', gap: 14 },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8,
    height: 52, paddingHorizontal: 24, borderRadius: 999, justifyContent: 'center',
  },

  // Modal contraseña
  modalOverlay: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalCard: { borderRadius: 28, padding: 24, gap: 12, alignItems: 'center' },
  modalIcon: { width: 48, height: 48, borderRadius: 999, justifyContent: 'center', alignItems: 'center' },
  pwInput: {
    width: '100%', height: 52, borderRadius: 16, borderWidth: 1,
    paddingHorizontal: 16, fontSize: 16, marginTop: 4,
  },
  modalActions: { flexDirection: 'row', gap: 12, width: '100%', marginTop: 4 },
  modalBtn: { flex: 1, height: 50, borderRadius: 999, justifyContent: 'center', alignItems: 'center' },
});

import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, Pressable, Alert, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { FintocWidget } from '../../components/FintocWidget';
import { useAppTheme } from '@/theme';

const CATEGORY_MAP: Record<string, string> = {
  'Alimentación': '107270f9-eba9-4cea-869b-6b30e40b3c89',
  'Seguros': '159ea258-d9c3-460e-b6d9-5a401d6154af',
  'Hogar': '1f3e03ae-3412-4e9c-8448-4d0f9e6825e8',
  'Deudas/Créditos': '2ddab285-c3ad-4d09-b3f5-a4c84e3b8501',
  'Ropa': '3fd83c61-83e8-474c-88dd-280e4eead3ff',
  'Entretenimiento': '40d3cdf7-7a31-4aa0-b9cc-ddb387471213',
  'Otros': '527f840d-106e-4e8d-8a21-a4005807147b',
  'Tecnología': '68845e3c-ed91-4e39-ac26-2d7b4b840973',
  'Educación': '68d34569-03d0-4324-897d-18b1c219ffa1',
  'Transporte': '793309a5-1df9-491a-862c-ce3c2c6f4c91',
  'Ingresos': '8a71638f-efea-4d22-acbb-963b3c75a947',
  'Vivienda': '8c7b181e-c813-4b6d-8425-ab5444d89981',
  'Ahorros': '91239c2d-b25f-4e6f-8402-9eee24814447',
  'Telecomunicaciones': 'aea300f7-3101-404d-b846-7e8cf5e8b4be',
  'Transferencias': 'bc671866-baca-475e-a608-98d8c7594507',
  'Salud': 'e3cce553-86cb-4214-9a31-1c9d3ccbae24'
};

export default function UserScreen() {
  const t = useAppTheme();
  const c = t.colors;

  const [userName, setUserName] = useState('Usuario');
  const [userEmail, setUserEmail] = useState('');
  const [showFintoc, setShowFintoc] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserEmail(user.email || '');
      setUserName(user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario');
    }
  };

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
      Alert.alert("Éxito", `Banco ${data?.bank_name || ''} vinculado correctamente`);
    } catch (err: any) {
      console.error(err);
      Alert.alert("Error", err.message);
    }
  };

  const handleImportExcel = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;
      setIsLoading(true);

      const fileUri = result.assets[0].uri;
      const fileContent = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' as any });

      const workbook = XLSX.read(fileContent, { type: 'base64' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado");

      const transactionsToInsert = data.map((row: any) => {
        const categoryName = row.categoria || row.Categoria || 'Otros';
        const categoryId = CATEGORY_MAP[categoryName] || CATEGORY_MAP['Otros'];

        return {
          user_id: user.id,
          date: row.fecha || row.Fecha || new Date().toISOString().split('T')[0],
          description: row.descripcion || row.Descripcion || 'Sin descripción',
          amount: Math.abs(parseFloat(row.monto || row.Monto || 0)),
          type: (row.tipo || row.Tipo)?.toLowerCase() === 'ingreso' ? 'ingreso' : 'gasto',
          category_id: categoryId,
        };
      });

      if (transactionsToInsert.length > 0) {
        const { error } = await supabase.from('transactions').insert(transactionsToInsert);
        if (error) throw error;
        Alert.alert("Éxito", `Se importaron ${transactionsToInsert.length} transacciones correctamente.`);
      } else {
        Alert.alert("Aviso", "No se encontraron transacciones válidas en el archivo.");
      }
    } catch (error: any) {
      console.error(error);
      Alert.alert("Error al importar", error.message || "Asegúrate de que el archivo tenga el formato correcto.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <View style={[styles.header, { backgroundColor: c.surface }]}>
        <Text style={[t.type.headlineMedium, { color: c.onSurface }]}>Perfil</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>

        {/* Profile card — primaryContainer */}
        <View style={[styles.profileCard, { backgroundColor: c.primaryContainer }]}>
          <View style={[styles.avatar, { backgroundColor: c.primary }]}>
            <Ionicons name="person" size={40} color={c.onPrimary} />
          </View>
          <Text style={[t.type.titleLarge, { color: c.onPrimaryContainer }]}>{userName}</Text>
          <Text style={[t.type.bodyMedium, { color: c.onPrimaryContainer, opacity: 0.8 }]}>{userEmail}</Text>
        </View>

        <Text style={[t.type.titleMedium, { color: c.onSurface, marginBottom: 12, marginLeft: 4 }]}>Bancos</Text>
        <Pressable
          style={({ pressed }) => [styles.actionButton, { backgroundColor: t.elevation[1], opacity: pressed ? 0.7 : 1 }]}
          onPress={() => setShowFintoc(true)}
        >
          <View style={[styles.iconBox, { backgroundColor: c.income + '22' }]}>
            <Ionicons name="business" size={24} color={c.income} />
          </View>
          <View style={styles.actionTextContainer}>
            <Text style={[t.type.titleMedium, { color: c.onSurface }]}>Vincular cuenta bancaria</Text>
            <Text style={[t.type.bodyMedium, { color: c.onSurfaceVariant }]}>Conecta tu banco de forma segura vía Fintoc</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={c.onSurfaceVariant} />
        </Pressable>

        <Text style={[t.type.titleMedium, { color: c.onSurface, marginBottom: 12, marginLeft: 4 }]}>Datos</Text>
        <Pressable
          style={({ pressed }) => [styles.actionButton, { backgroundColor: t.elevation[1], opacity: pressed ? 0.7 : 1 }]}
          onPress={handleImportExcel}
          disabled={isLoading}
        >
          <View style={[styles.iconBox, { backgroundColor: c.primary + '22' }]}>
            {isLoading ? <ActivityIndicator color={c.primary} /> : <Ionicons name="document-text" size={24} color={c.primary} />}
          </View>
          <View style={styles.actionTextContainer}>
            <Text style={[t.type.titleMedium, { color: c.onSurface }]}>Importar desde Excel</Text>
            <Text style={[t.type.bodyMedium, { color: c.onSurfaceVariant }]}>Sube un archivo .xlsx con tus gastos e ingresos</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={c.onSurfaceVariant} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.logoutButton, { backgroundColor: c.errorContainer, opacity: pressed ? 0.7 : 1 }]}
          onPress={handleLogout}
        >
          <Text style={[t.type.titleSmall, { color: c.onErrorContainer }]}>Cerrar sesión</Text>
        </Pressable>

      </ScrollView>

      <Modal visible={showFintoc} animationType="slide" onRequestClose={() => setShowFintoc(false)}>
        <View style={{ flex: 1, backgroundColor: c.background }}>
          <View style={styles.modalHeader}>
            <Text style={[t.type.headlineSmall, { color: c.onSurface }]}>Vincular cuenta</Text>
            <Pressable onPress={() => setShowFintoc(false)} style={[styles.modalClose, { backgroundColor: t.elevation[3] }]}>
              <Ionicons name="close" size={24} color={c.onSurface} />
            </Pressable>
          </View>
          {showFintoc && (
            <FintocWidget onLinkSuccess={handleLinkSuccess} onExit={() => setShowFintoc(false)} />
          )}
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16 },
  profileCard: { alignItems: 'center', padding: 30, borderRadius: 28, marginBottom: 30 },
  avatar: { width: 80, height: 80, borderRadius: 999, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  actionButton: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 24, marginBottom: 24 },
  iconBox: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  actionTextContainer: { flex: 1, gap: 4 },
  logoutButton: { marginTop: 20, padding: 16, borderRadius: 999, alignItems: 'center' },
  modalHeader: {
    paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  modalClose: { width: 40, height: 40, borderRadius: 999, justifyContent: 'center', alignItems: 'center' },
});

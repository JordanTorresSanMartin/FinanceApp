import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, Pressable, Alert, Modal, ActivityIndicator, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { FintocWidget } from '../../components/FintocWidget';

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
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  
  const [userName, setUserName] = useState('Usuario');
  const [userEmail, setUserEmail] = useState('');
  const [showFintoc, setShowFintoc] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const BG = isDark ? '#0F0F0F' : '#F4F6FB';
  const CARD = isDark ? '#1C1C1E' : '#FFFFFF';
  const TEXT = isDark ? '#F2F2F7' : '#1C1C1E';
  const TEXT2 = isDark ? '#8E8E93' : '#6C6C70';
  const BORDER = isDark ? '#2C2C2E' : '#E5E5EA';
  const BLUE = '#007AFF';

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

      // Esperamos que el excel tenga columnas: fecha (YYYY-MM-DD), descripcion, monto, categoria, tipo (gasto/ingreso)
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
    <View style={[styles.screen, { backgroundColor: BG }]}>
      <View style={[styles.header, { backgroundColor: CARD, borderBottomColor: BORDER }]}>
        <Text style={[styles.headerTitle, { color: TEXT }]}>Perfil</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
        
        <View style={[styles.profileCard, { backgroundColor: CARD, borderColor: BORDER }]}>
          <View style={[styles.avatar, { backgroundColor: BLUE + '20' }]}>
            <Ionicons name="person" size={40} color={BLUE} />
          </View>
          <Text style={[styles.name, { color: TEXT }]}>{userName}</Text>
          <Text style={[styles.email, { color: TEXT2 }]}>{userEmail}</Text>
        </View>

        <Text style={[styles.sectionTitle, { color: TEXT }]}>Bancos</Text>
        <Pressable 
          style={({ pressed }) => [styles.actionButton, { backgroundColor: CARD, borderColor: BORDER, opacity: pressed ? 0.7 : 1 }]}
          onPress={() => setShowFintoc(true)}
        >
          <View style={[styles.iconBox, { backgroundColor: '#34C75920' }]}>
            <Ionicons name="business" size={24} color="#34C759" />
          </View>
          <View style={styles.actionTextContainer}>
            <Text style={[styles.actionTitle, { color: TEXT }]}>Vincular Cuenta Bancaria</Text>
            <Text style={[styles.actionSub, { color: TEXT2 }]}>Conecta tu banco de forma segura vía Fintoc</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={TEXT2} />
        </Pressable>

        <Text style={[styles.sectionTitle, { color: TEXT }]}>Datos</Text>
        <Pressable 
          style={({ pressed }) => [styles.actionButton, { backgroundColor: CARD, borderColor: BORDER, opacity: pressed ? 0.7 : 1 }]}
          onPress={handleImportExcel}
          disabled={isLoading}
        >
          <View style={[styles.iconBox, { backgroundColor: BLUE + '20' }]}>
            {isLoading ? <ActivityIndicator color={BLUE} /> : <Ionicons name="document-text" size={24} color={BLUE} />}
          </View>
          <View style={styles.actionTextContainer}>
            <Text style={[styles.actionTitle, { color: TEXT }]}>Importar desde Excel</Text>
            <Text style={[styles.actionSub, { color: TEXT2 }]}>Sube un archivo .xlsx con tus gastos e ingresos</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={TEXT2} />
        </Pressable>

        <Pressable 
          style={({ pressed }) => [styles.logoutButton, { opacity: pressed ? 0.7 : 1 }]}
          onPress={handleLogout}
        >
          <Text style={styles.logoutText}>Cerrar Sesión</Text>
        </Pressable>

      </ScrollView>

      <Modal visible={showFintoc} animationType="slide" onRequestClose={() => setShowFintoc(false)}>
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={{ paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: TEXT }}>Vincular Cuenta</Text>
            <Pressable onPress={() => setShowFintoc(false)}>
              <Ionicons name="close" size={28} color={TEXT} />
            </Pressable>
          </View>
          {showFintoc && (
            <FintocWidget 
              onLinkSuccess={handleLinkSuccess} 
              onExit={() => setShowFintoc(false)} 
            />
          )}
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { 
    paddingTop: 60, 
    paddingHorizontal: 20, 
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 28, fontWeight: 'bold' },
  profileCard: {
    alignItems: 'center',
    padding: 30,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 30,
  },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
  },
  name: { fontSize: 22, fontWeight: 'bold', marginBottom: 4 },
  email: { fontSize: 14 },
  sectionTitle: {
    fontSize: 18, fontWeight: '600', marginBottom: 12, marginLeft: 4
  },
  actionButton: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 24,
  },
  iconBox: {
    width: 48, height: 48, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 16,
  },
  actionTextContainer: { flex: 1 },
  actionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  actionSub: { fontSize: 13 },
  logoutButton: {
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#FF3B3015',
    alignItems: 'center',
  },
  logoutText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
  }
});

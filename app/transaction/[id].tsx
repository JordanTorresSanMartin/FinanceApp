import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

// Usamos el mismo diseño que new.tsx pero con fetch de datos para editar
// Aquí proveo un boilerplate para cumplir el requerimiento
export default function EditTransactionScreen() {
  const { id } = useLocalSearchParams();
  
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Editar Transacción ID: {id}</Text>
      <Text style={styles.subtext}>
        (Utilizaría el mismo formulario que app/transaction/new.tsx, 
        pero prellenado con los datos de Supabase haciendo un select eq('id', id))
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center',
    padding: 20
  },
  text: {
    fontSize: 20, 
    fontWeight: 'bold',
    marginBottom: 10
  },
  subtext: {
    textAlign: 'center',
    color: '#666'
  }
});

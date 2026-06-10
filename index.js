import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { widgetTaskHandler } from './widgets/widget-task-handler';

// Punto de entrada de expo-router (reemplaza "main": "expo-router/entry")
import 'expo-router/entry';

// Registra el handler que renderiza el widget y procesa los toques
registerWidgetTaskHandler(widgetTaskHandler);

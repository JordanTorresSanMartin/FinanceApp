import { Linking } from 'react-native';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { QuickAddWidget } from './QuickAddWidget';

const nameToWidget = {
  QuickAdd: QuickAddWidget,
};

/** Deep links que abre el widget (resueltos por expo-router, scheme "financeapp"). */
const DEEP_LINKS: Record<string, string> = {
  ADD_GASTO: 'financeapp://transaction/new?type=gasto',
  ADD_INGRESO: 'financeapp://transaction/new?type=ingreso',
};

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const widgetInfo = props.widgetInfo;
  const Widget = nameToWidget[widgetInfo.widgetName as keyof typeof nameToWidget];

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      if (Widget) props.renderWidget(<Widget />);
      break;

    case 'WIDGET_CLICK': {
      const uri = DEEP_LINKS[props.clickAction ?? ''];
      if (uri) {
        try {
          await Linking.openURL(uri);
        } catch (e) {
          // Fallback: abrir la app sin parámetros
          await Linking.openURL('financeapp://');
        }
      }
      break;
    }

    default:
      break;
  }
}

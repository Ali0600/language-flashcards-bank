// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight, SymbolViewProps } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'camera.fill': 'photo-camera',
  'book.fill': 'menu-book',
  'rectangle.stack.fill': 'collections-bookmark',
  'photo.fill': 'photo',
  'sparkles': 'auto-awesome',
  'chart.bar.fill': 'bar-chart',
  'gearshape.fill': 'settings',
  'xmark.circle.fill': 'cancel',
  'speaker.wave.2.fill': 'volume-up',
  'shippingbox.fill': 'inventory-2',
  'fork.knife': 'restaurant',
  'signpost.right.fill': 'signpost',
  'tram.fill': 'train',
  'cross.case.fill': 'medical-services',
  'doc.fill': 'description',
  'tshirt.fill': 'checkroom',
  'tv.fill': 'devices',
  'leaf.fill': 'park',
  'square.stack.fill': 'apps',
  'questionmark.folder.fill': 'folder-open',
  'folder.fill': 'folder',
  'chevron.down': 'expand-more',
  'checkmark.circle.fill': 'check-circle',
  'circle': 'radio-button-unchecked',
  'trash.fill': 'delete',
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}

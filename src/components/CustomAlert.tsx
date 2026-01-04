import React from 'react';
import { Modal, View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Surface, Text, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';

interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message: string;
  buttons?: AlertButton[];
  icon?: string;
  onDismiss?: () => void;
  maxHeight?: number;
}

const CustomAlert: React.FC<CustomAlertProps> = ({
  visible,
  title,
  message,
  buttons,
  icon,
  onDismiss,
  maxHeight,
}) => {
  const finalButtons = buttons === undefined ? [{ text: 'OK' }] : buttons;
  const isDismissible = finalButtons && finalButtons.length > 0;

  const handleButtonPress = (button: AlertButton) => {
    if (button.onPress) button.onPress();
    else if (onDismiss) onDismiss();
  };

  const getButtonColor = (style?: string) => {
    switch (style) {
      case 'destructive': return theme.colors.error;
      case 'cancel': return theme.colors.onSurfaceVariant;
      default: return theme.colors.primary;
    }
  };

  const isStacked = finalButtons.length > 2;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={isDismissible ? onDismiss : undefined}
    >
      {/* Pressable Overlay: Clicking background dismisses the modal.
        We remove TouchableWithoutFeedback because it kills scroll gestures.
      */}
      <Pressable 
        style={styles.overlay} 
        onPress={isDismissible ? onDismiss : undefined}
      >
        {/* Stop Propagation: Pressing the actual card shouldn't close it.
          We use a View with onStartShouldSetResponder to block clicks passing through to the overlay.
        */}
        <View onStartShouldSetResponder={() => true}>
          <Surface style={[styles.alertContainer, maxHeight ? { maxHeight } : {}]}>
            
            {/* Header */}
            <View style={styles.headerContainer}>
               <View style={styles.iconBadge}>
                  <MaterialCommunityIcons name={icon as any || "alert-circle-outline"} size={24} color={theme.colors.primary} />
               </View>
               <Text variant="titleLarge" style={styles.title}>
                 {title}
               </Text>
            </View>

            {/* Scrollable Message */}
            <ScrollView 
              style={styles.messageContainer}
              persistentScrollbar={true} // Visual cue that it scrolls
              showsVerticalScrollIndicator={true}
            >
              <Pressable>
                {/* Inner Pressable ensures touches inside the text don't bubble up 
                  accidentally, though ScrollView handles this mostly. 
                */}
                <Text variant="bodyMedium" style={styles.message}>
                  {message}
                </Text>
              </Pressable>
            </ScrollView>

            {/* Buttons */}
            {isDismissible && (
              <View style={[styles.buttonContainer, isStacked && styles.buttonContainerStacked]}>
                {finalButtons.map((button, index) => (
                  <Button
                    key={index}
                    mode={button.style === 'destructive' ? 'contained' : 'text'}
                    onPress={() => handleButtonPress(button)}
                    textColor={button.style === 'destructive' ? theme.colors.onError : getButtonColor(button.style)}
                    buttonColor={button.style === 'destructive' ? theme.colors.error : undefined}
                    labelStyle={styles.buttonLabel}
                    style={[
                      styles.button, 
                      !isStacked && index > 0 && { marginLeft: 8 },
                      isStacked && index > 0 && { marginTop: 8 }
                    ]}
                  >
                    {button.text}
                  </Button>
                ))}
              </View>
            )}
          </Surface>
        </View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 24,
  },
  alertContainer: {
    width: '100%',
    // Fixed width constraint ensures it looks like a card on tablets too
    maxWidth: 340, 
    // Default max height if prop not provided (allows scrolling)
    maxHeight: 500, 
    backgroundColor: '#FDFBFF',
    borderRadius: 28,
    padding: 24,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  iconBadge: {
    backgroundColor: theme.colors.surfaceVariant,
    padding: 8,
    borderRadius: 12,
    marginRight: 12,
  },
  title: {
    textAlign: 'left',
    fontFamily: 'Outfit_700Bold',
    color: theme.colors.onSurface,
    flexShrink: 1,
  },
  messageContainer: {
    marginBottom: 24,
    flexGrow: 0, // Allows ScrollView to shrink if content is small
  },
  message: {
    textAlign: 'left',
    fontFamily: 'Outfit_400Regular',
    color: theme.colors.onSurfaceVariant,
    fontSize: 15,
    lineHeight: 22,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: '100%',
  },
  buttonContainerStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  button: {
    minWidth: 80,
    borderRadius: 100,
  },
  buttonLabel: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
    letterSpacing: 0.5,
  }
});

export default CustomAlert;
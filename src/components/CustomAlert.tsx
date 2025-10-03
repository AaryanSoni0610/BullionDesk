import React from 'react';
import { Modal, View, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { Surface, Text, Button } from 'react-native-paper';
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
  onDismiss?: () => void;
}

const CustomAlert: React.FC<CustomAlertProps> = ({
  visible,
  title,
  message,
  buttons,
  onDismiss,
}) => {
  // Use default OK button only if buttons is undefined, not if it's an empty array
  const finalButtons = buttons === undefined ? [{ text: 'OK' }] : buttons;
  // If no buttons provided or empty array, make alert non-dismissible
  const isDismissible = finalButtons && finalButtons.length > 0;

  const handleButtonPress = (button: AlertButton) => {
    if (button.onPress) {
      button.onPress();
    }
    if (onDismiss) {
      onDismiss();
    }
  };

  const getButtonColor = (style?: string) => {
    switch (style) {
      case 'destructive':
        return theme.colors.error;
      case 'cancel':
        return theme.colors.onSurfaceVariant;
      default:
        return theme.colors.primary;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={isDismissible ? onDismiss : undefined}
    >
      <TouchableWithoutFeedback onPress={isDismissible ? onDismiss : undefined}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <Surface style={[styles.alertContainer, { backgroundColor: theme.colors.surface }]}>
              <Text
                variant="headlineSmall"
                style={[styles.title, { color: theme.colors.onSurface }]}
              >
                {title}
              </Text>
              <Text
                variant="bodyMedium"
                style={[styles.message, { color: theme.colors.onSurfaceVariant }]}
              >
                {message}
              </Text>
              {isDismissible && (
                <View style={styles.buttonContainer}>
                  {finalButtons.map((button, index) => (
                    <Button
                      key={index}
                      mode="text"
                      onPress={() => handleButtonPress(button)}
                      textColor={getButtonColor(button.style)}
                      style={styles.button}
                    >
                      {button.text}
                    </Button>
                  ))}
                </View>
              )}
            </Surface>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  alertContainer: {
    margin: 20,
    padding: 24,
    borderRadius: 12,
    elevation: 6,
    minWidth: 280,
    maxWidth: 400,
  },
  title: {
    marginBottom: 16,
    textAlign: 'left',
    fontWeight: '600',
  },
  message: {
    marginBottom: 24,
    textAlign: 'left',
    lineHeight: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  button: {
    minWidth: 64,
  },
});

export default CustomAlert;
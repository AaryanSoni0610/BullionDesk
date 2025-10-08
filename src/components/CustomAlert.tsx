import React from 'react';
import { Modal, View, StyleSheet, TouchableWithoutFeedback, ScrollView } from 'react-native';
import { Surface, Text, Button, TextInput } from 'react-native-paper';
import { theme } from '../theme';

interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface AlertInput {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad';
  placeholder?: string;
}

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message: string;
  buttons?: AlertButton[];
  inputs?: AlertInput[];
  onDismiss?: () => void;
  maxHeight?: number;
}

const CustomAlert: React.FC<CustomAlertProps> = ({
  visible,
  title,
  message,
  buttons,
  inputs,
  onDismiss,
  maxHeight,
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
          <TouchableWithoutFeedback onPress={() => {}}>
            <Surface style={[styles.alertContainer, { backgroundColor: theme.colors.surface }, maxHeight ? { maxHeight } : {}]}>
              <Text
                variant="headlineSmall"
                style={[styles.title, { color: theme.colors.onSurface }]}
              >
                {title}
              </Text>
              <ScrollView
                style={styles.messageContainer}
                showsVerticalScrollIndicator={true}
                bounces={false}
                scrollEnabled={true}
                nestedScrollEnabled={true}
                contentContainerStyle={styles.messageContent}
              >
                <Text
                  variant="bodyMedium"
                  style={[styles.message, { color: theme.colors.onSurfaceVariant }]}
                >
                  {message}
                </Text>
              </ScrollView>
              {inputs && inputs.length > 0 && (
                <View style={styles.inputsContainer}>
                  {inputs.map((input, index) => (
                    <TextInput
                      key={index}
                      label={input.label}
                      value={input.value}
                      onChangeText={input.onChangeText}
                      keyboardType={input.keyboardType || 'default'}
                      placeholder={input.placeholder}
                      mode="outlined"
                      style={styles.input}
                      theme={{ colors: { primary: theme.colors.primary } }}
                    />
                  ))}
                </View>
              )}
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
    minWidth: 400,
    maxWidth: 400,
  },
  title: {
    marginBottom: 16,
    textAlign: 'left',
    fontFamily: 'Roboto_500Medium',
  },
  messageContainer: {
    marginBottom: 8,
  },
  messageContent: {
    paddingVertical: 4,
  },
  message: {
    textAlign: 'left',
    lineHeight: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  button: {
    minWidth: 64,
  },
  inputsContainer: {
    marginTop: 16,
    gap: 12,
  },
  input: {
    marginBottom: 8,
  },
});

export default CustomAlert;
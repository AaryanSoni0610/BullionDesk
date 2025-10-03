import { useAppContext } from '../context/AppContext';

interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export const useAlert = () => {
  const { showAlert } = useAppContext();

  const alert = (title: string, message: string, buttons?: AlertButton[]) => {
    showAlert(title, message, buttons);
  };

  return { alert };
};

// Convenience functions for common alert patterns
export const showSuccessAlert = (message: string, onPress?: () => void) => {
  // This would need access to the context, so it's better to use the hook
  // This is just a placeholder for the pattern
};

export const showErrorAlert = (message: string, onPress?: () => void) => {
  // This would need access to the context, so it's better to use the hook
  // This is just a placeholder for the pattern
};

export const showConfirmAlert = (
  title: string,
  message: string,
  onConfirm: () => void,
  onCancel?: () => void
) => {
  // This would need access to the context, so it's better to use the hook
  // This is just a placeholder for the pattern
};
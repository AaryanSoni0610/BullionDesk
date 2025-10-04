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
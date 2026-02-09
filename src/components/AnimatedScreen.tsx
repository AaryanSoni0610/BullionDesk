import React, { useEffect, useRef } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface AnimatedScreenProps {
  children: React.ReactNode;
  isVisible: boolean;
  direction?: 'left' | 'right'; // Direction screen slides FROM when entering
  duration?: number;
}

export const AnimatedScreen: React.FC<AnimatedScreenProps> = ({
  children,
  isVisible,
  direction = 'right',
  duration = 350,
}) => {
  const translateX = useSharedValue(direction === 'right' ? SCREEN_WIDTH : -SCREEN_WIDTH);
  const opacity = useSharedValue(0);
  const [shouldRender, setShouldRender] = React.useState(isVisible);

  useEffect(() => {
    if (isVisible) {
      setShouldRender(true);
      // Slide in FROM the specified direction
      // If direction is 'right', screen comes from right (positive X) to center (0)
      translateX.value = direction === 'right' ? SCREEN_WIDTH : -SCREEN_WIDTH;
      translateX.value = withTiming(0, {
        duration,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      });
      opacity.value = withTiming(1, {
        duration: duration * 0.8,
        easing: Easing.ease,
      });
    } else {
      // Slide out BACK TO the same direction it came from
      // If it came from right, it should go back to right (positive X)
      translateX.value = withTiming(direction === 'right' ? SCREEN_WIDTH : -SCREEN_WIDTH, {
        duration,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      }, (finished) => {
        if (finished) {
          runOnJS(setShouldRender)(false);
        }
      });
      opacity.value = withTiming(0, {
        duration: duration * 0.6,
        easing: Easing.ease,
      });
    }
  }, [isVisible, direction]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  if (!shouldRender) {
    return null;
  }

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      {children}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FAFAFA',
  },
});

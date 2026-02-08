import React, { useState, useEffect } from 'react';
import { View, LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface AnimatedAccordionProps {
  isExpanded: boolean;
  children: React.ReactNode;
}

export const AnimatedAccordion: React.FC<AnimatedAccordionProps> = ({ isExpanded, children }) => {
  const height = useSharedValue(0);
  const [contentHeight, setContentHeight] = useState<number | null>(null);

  useEffect(() => {
    if (contentHeight !== null) {
      if (isExpanded) {
        height.value = withTiming(contentHeight, {
          duration: 300,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        });
      } else {
        height.value = withTiming(0, {
          duration: 250,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        });
      }
    }
  }, [isExpanded, contentHeight]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
    overflow: 'hidden',
  }));

  const handleLayout = (event: LayoutChangeEvent) => {
    const { height: measuredHeight } = event.nativeEvent.layout;
    if (measuredHeight > 0 && measuredHeight !== contentHeight) {
      setContentHeight(measuredHeight);
    }
  };

  // Render content off-screen to measure it first
  if (contentHeight === null) {
    return (
      <View style={{ position: 'absolute', opacity: 0, zIndex: -1 }} onLayout={handleLayout}>
        {children}
      </View>
    );
  }

  return (
    <Animated.View style={animatedStyle}>
      <View style={{ position: 'absolute', width: '100%', top: 0 }} onLayout={handleLayout}>
        {children}
      </View>
    </Animated.View>
  );
};

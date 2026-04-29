import React, { useRef, useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
// useSharedValue must not be called conditionally or re-initialised on every
// render — that triggers Reanimated strict-mode warnings. We call it once and
// hold the result in a ref so it survives re-renders without being recreated.

interface AnimatedAccordionProps {
  isExpanded: boolean;
  children: React.ReactNode;
  // Fixed height the accordion opens to. When provided, no onLayout
  // measurement is needed — the animation is perfectly stable every time.
  expandedHeight?: number;
}

const TIMING_CONFIG = {
  duration: 250,
  easing: Easing.bezier(0.25, 0.1, 0.25, 1),
};

const DEFAULT_EXPANDED_HEIGHT = 300;

export const AnimatedAccordion: React.FC<AnimatedAccordionProps> = ({
  isExpanded,
  children,
  expandedHeight = DEFAULT_EXPANDED_HEIGHT,
}) => {
  const animatedHeight = useSharedValue(isExpanded ? expandedHeight : 0);

  // Children stay mounted once ever expanded. overflow:hidden hides them
  // at height 0 — no unmount needed, no measurement resets.
  const hasEverExpandedRef = useRef(isExpanded);
  if (isExpanded) hasEverExpandedRef.current = true;

  useEffect(() => {
    animatedHeight.value = withTiming(
      isExpanded ? expandedHeight : 0,
      TIMING_CONFIG,
    );
  }, [isExpanded, expandedHeight]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: animatedHeight.value,
  }));

  return (
    <Animated.View style={[animatedStyle, { overflow: 'hidden' }]}>
      {/* No flex:1 here — the inner View must size to its content, not its
          parent. flex:1 would make it match the animating parent height (0→300)
          which breaks layout. The parent's overflow:hidden clips it visually. */}
      <View>
        {hasEverExpandedRef.current ? children : null}
      </View>
    </Animated.View>
  );
};
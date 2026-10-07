import { useEffect, useRef, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

const CLAIM_DISTANCE = 12;
const NAVIGATION_DISTANCE = 64;
const HORIZONTAL_RATIO = 1.3;

type SwipeableCardProps = {
  /** Swipe left to show the next card in this group. Omit at the last card. */
  onSwipeLeft?: () => void;
  /** Swipe right to show the previous card in this group. Omit at the first card. */
  onSwipeRight?: () => void;
  /** Reset the slide position whenever the displayed card changes. */
  cardKey: string | number;
  /** Called once a horizontal gesture takes over from a tap. */
  onSwipeStart?: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Wrap a card with horizontal navigation. It claims only a deliberate
 * horizontal drag, leaving taps for FlipCard and vertical drags for ScrollView.
 */
export function SwipeableCard({
  onSwipeLeft,
  onSwipeRight,
  onSwipeStart,
  cardKey,
  children,
  style,
}: SwipeableCardProps) {
  const { width } = useWindowDimensions();
  const translation = useRef(new Animated.Value(0)).current;
  const callbacks = useRef({ onSwipeLeft, onSwipeRight, onSwipeStart, width });
  const transitioning = useRef(false);
  const arrivalFrom = useRef(0);
  const mounted = useRef(true);
  callbacks.current = { onSwipeLeft, onSwipeRight, onSwipeStart, width };

  const responder = useRef(
    PanResponder.create({
      // Capture a horizontal move before the child Pressable can treat it as a tap.
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        !transitioning.current &&
        Math.abs(gesture.dx) > CLAIM_DISTANCE &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * HORIZONTAL_RATIO,
      onPanResponderGrant: () => {
        translation.stopAnimation();
        callbacks.current.onSwipeStart?.();
      },
      onPanResponderMove: (_, gesture) => {
        const available = gesture.dx < 0
          ? Boolean(callbacks.current.onSwipeLeft)
          : Boolean(callbacks.current.onSwipeRight);
        // At the first/last card, provide a small elastic edge instead of leaving.
        translation.setValue(gesture.dx * (available ? 0.85 : 0.14));
      },
      onPanResponderRelease: (_, gesture) => {
        const horizontal =
          Math.abs(gesture.dx) >= NAVIGATION_DISTANCE &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * HORIZONTAL_RATIO;
        const direction = gesture.dx < 0 ? -1 : 1;
        const navigate = direction < 0
          ? callbacks.current.onSwipeLeft
          : callbacks.current.onSwipeRight;

        if (horizontal && navigate) {
          transitioning.current = true;
          arrivalFrom.current = -direction;
          Animated.timing(translation, {
            toValue: direction * callbacks.current.width,
            duration: 170,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start(({ finished }) => {
            if (finished && mounted.current) navigate();
            else {
              arrivalFrom.current = 0;
              transitioning.current = false;
            }
          });
        } else {
          Animated.spring(translation, {
            toValue: 0,
            tension: 140,
            friction: 12,
            useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        transitioning.current = false;
        Animated.spring(translation, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      translation.stopAnimation();
    };
  }, [translation]);

  useEffect(() => {
    translation.stopAnimation();
    if (arrivalFrom.current !== 0) {
      translation.setValue(arrivalFrom.current * width);
      arrivalFrom.current = 0;
      Animated.timing(translation, {
        toValue: 0,
        duration: 190,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => { transitioning.current = false; });
    } else {
      translation.setValue(0);
      transitioning.current = false;
    }
  }, [cardKey, translation, width]);

  return (
    <Animated.View
      {...responder.panHandlers}
      style={[style, { transform: [{ translateX: translation }] }]}
    >
      {children}
    </Animated.View>
  );
}

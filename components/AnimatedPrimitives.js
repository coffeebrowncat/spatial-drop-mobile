import { Animated } from 'react-native';
import { Circle, Line, Path, G } from 'react-native-svg';

export const AnimatedCircle = Animated.createAnimatedComponent(Circle);
export const AnimatedLine = Animated.createAnimatedComponent(Line); // kept for reference, unused by branches now
export const AnimatedPath = Animated.createAnimatedComponent(Path);
export const AnimatedG = Animated.createAnimatedComponent(G); // NEW — lets a group be rotated via a native-driven Animated.Value instead of recomputing child geometry every frame on the JS thread
import { Animated } from 'react-native';
import { Circle, Line, Path } from 'react-native-svg';

export const AnimatedCircle = Animated.createAnimatedComponent(Circle);
export const AnimatedLine = Animated.createAnimatedComponent(Line); // kept for reference, unused by branches now
export const AnimatedPath = Animated.createAnimatedComponent(Path);
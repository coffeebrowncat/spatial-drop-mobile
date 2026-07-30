import { Dimensions } from 'react-native';

// exact screen size, measured once at load
const { width: windowWidth, height: windowHeight } = Dimensions.get('window');
export { windowWidth, windowHeight };

// anchor is the "you" sphere: a big circle mostly pushed below the screen,
// only its top arc is visible, cresting the bottom edge like a horizon
export const ANCHOR_X = windowWidth / 2; // horizontal center of the screen
export const ANCHOR_RADIUS = 130; // true size of the anchor sphere
export const ANCHOR_VISIBLE = 110; // pixels of its arc that actually poke above the bottom edge
export const ANCHOR_Y = windowHeight - ANCHOR_VISIBLE; // topmost point of the visible arc; what lines/booms treat as "the anchor"
export const ANCHOR_CY = ANCHOR_Y + ANCHOR_RADIUS; // circle's true center, sitting below the screen

// breathing room peers need to stay inside real screen bounds
export const SCREEN_PADDING = 50;
export const TOP_SAFE_ZONE = 110; // keeps peers clear of the "flick to transmit" label
export const BOTTOM_SAFE_ZONE = ANCHOR_Y - 60; // keeps peers clear of the anchor itself
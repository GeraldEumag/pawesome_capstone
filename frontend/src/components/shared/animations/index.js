/* ─────────────────────────────────────────────────────────────
   Global Animations - Main Export File
───────────────────────────────────────────────────────────── */

// Keyframe animations
export {
  fadeIn,
  fadeInUp,
  fadeInDown,
  fadeInLeft,
  fadeInRight,
  scaleIn,
  scaleInBounce,
  slideInUp,
  slideInDown,
  slideInLeft,
  slideInRight,
  spin,
  pulse,
  shake,
  bounce,
  glow,
  glowPulse
} from './GlobalAnimations';

// Styled components with animations
export {
  FadeIn,
  FadeInUp,
  FadeInDown,
  FadeInLeft,
  FadeInRight,
  ScaleIn,
  ScaleInBounce,
  SlideInUp,
  SlideInDown,
  SlideInLeft,
  SlideInRight,
  Spinning,
  Pulsing,
  Shaking,
  Bouncing,
  Glowing,
  GlowingPulse
} from './GlobalAnimations';

// Animation mixins and utilities
export {
  animationMixin,
  hoverMixin,
  glassHoverMixin,
  focusMixin,
  loadingMixin,
  getAnimationProps,
  getTransitionProps,
  THEME
} from './GlobalAnimations';

// Animation hooks
export {
  useAnimation,
  useScrollAnimation,
  useHoverAnimation,
  useLoadingAnimation,
  useStaggeredAnimation,
  usePresetAnimation,
  withAnimation,
  withScrollAnimation,
  animationPresets
} from './useAnimations.jsx';

/* ─────────────────────────────────────────────────────────────
   Quick Import Examples
───────────────────────────────────────────────────────────── */

/*
// Import all animations
import { 
  FadeIn, ScaleIn, Spinning, 
  useScrollAnimation, useHoverAnimation,
  fadeIn, slideInUp, pulse 
} from '../components/shared/animations';

// Import only keyframes
import { fadeIn, slideInUp, bounce } from '../components/shared/animations';

// Import only hooks
import { useScrollAnimation, useHoverAnimation } from '../components/shared/animations';

// Import only styled components
import { FadeIn, ScaleIn, Spinning } from '../components/shared/animations';
*/

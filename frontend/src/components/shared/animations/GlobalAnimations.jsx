import styled, { keyframes } from "styled-components";

/* ─────────────────────────────────────────────────────────────
   Pink Glass Theme Animation Tokens
───────────────────────────────────────────────────────────── */
const THEME = {
  // Animation durations
  duration: {
    fast: "0.2s",
    normal: "0.3s",
    slow: "0.5s",
    slower: "0.8s",
  },
  
  // Animation easing
  easing: {
    smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
    bounce: "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
    elastic: "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
  },
  
  // Colors for animations — resolved from CSS variables at runtime
  colors: {
    primary: "var(--color-primary, #ff5f93)",
    primaryLight: "var(--color-primary-light, #ff8db5)",
    glassBorder: "var(--color-border, rgba(255,95,147,0.18))",
    glassShadow: "var(--shadow-card, 0 18px 45px rgba(255,95,147,0.14))",
  },
};

/* ─────────────────────────────────────────────────────────────
   Keyframe Animations
───────────────────────────────────────────────────────────── */

// Fade animations
export const fadeIn = keyframes`
  from { 
    opacity: 0; 
    transform: translateY(20px); 
  }
  to { 
    opacity: 1; 
    transform: translateY(0); 
  }
`;

export const fadeInUp = keyframes`
  from { 
    opacity: 0; 
    transform: translateY(30px); 
  }
  to { 
    opacity: 1; 
    transform: translateY(0); 
  }
`;

export const fadeInDown = keyframes`
  from { 
    opacity: 0; 
    transform: translateY(-30px); 
  }
  to { 
    opacity: 1; 
    transform: translateY(0); 
  }
`;

export const fadeInLeft = keyframes`
  from { 
    opacity: 0; 
    transform: translateX(-30px); 
  }
  to { 
    opacity: 1; 
    transform: translateX(0); 
  }
`;

export const fadeInRight = keyframes`
  from { 
    opacity: 0; 
    transform: translateX(30px); 
  }
  to { 
    opacity: 1; 
    transform: translateX(0); 
  }
`;

// Scale animations
export const scaleIn = keyframes`
  from { 
    opacity: 0; 
    transform: scale(0.8); 
  }
  to { 
    opacity: 1; 
    transform: scale(1); 
  }
`;

export const scaleInBounce = keyframes`
  0% { 
    opacity: 0; 
    transform: scale(0.3); 
  }
  50% { 
    opacity: 1; 
    transform: scale(1.05); 
  }
  70% { 
    transform: scale(0.9); 
  }
  100% { 
    opacity: 1; 
    transform: scale(1); 
  }
`;

// Slide animations
export const slideInUp = keyframes`
  from { 
    transform: translateY(100%); 
  }
  to { 
    transform: translateY(0); 
  }
`;

export const slideInDown = keyframes`
  from { 
    transform: translateY(-100%); 
  }
  to { 
    transform: translateY(0); 
  }
`;

export const slideInLeft = keyframes`
  from { 
    transform: translateX(-100%); 
  }
  to { 
    transform: translateX(0); 
  }
`;

export const slideInRight = keyframes`
  from { 
    transform: translateX(100%); 
  }
  to { 
    transform: translateX(0); 
  }
`;

// Rotation and spin animations
export const spin = keyframes`
  from { 
    transform: rotate(0deg); 
  }
  to { 
    transform: rotate(360deg); 
  }
`;

export const pulse = keyframes`
  0%, 100% { 
    opacity: 1; 
    transform: scale(1); 
  }
  50% { 
    opacity: 0.7; 
    transform: scale(1.05); 
  }
`;

export const shake = keyframes`
  0%, 100% { 
    transform: translateX(0); 
  }
  10%, 30%, 50%, 70%, 90% { 
    transform: translateX(-10px); 
  }
  20%, 40%, 60%, 80% { 
    transform: translateX(10px); 
  }
`;

export const bounce = keyframes`
  0%, 20%, 53%, 80%, 100% { 
    transform: translateY(0); 
  }
  40%, 43% { 
    transform: translateY(-30px); 
  }
  70% { 
    transform: translateY(-15px); 
  }
  90% { 
    transform: translateY(-4px); 
  }
`;

// Glow animations
export const glow = keyframes`
  0%, 100% { 
    box-shadow: 0 0 20px rgba(0, 0, 0, 0.12); 
  }
  50% { 
    box-shadow: 0 0 30px rgba(0, 0, 0, 0.22); 
  }
`;

export const glowPulse = keyframes`
  0%, 100% { 
    box-shadow: 0 0 15px rgba(0, 0, 0, 0.08); 
  }
  50% { 
    box-shadow: 0 0 25px rgba(0, 0, 0, 0.18); 
  }
`;

/* ─────────────────────────────────────────────────────────────
   Animated Components
───────────────────────────────────────────────────────────── */

// Fade animations
export const FadeIn = styled.div`
  animation: ${fadeIn} ${THEME.duration.normal} ${THEME.easing.smooth} forwards;
`;

export const FadeInUp = styled.div`
  animation: ${fadeInUp} ${THEME.duration.normal} ${THEME.easing.smooth} forwards;
`;

export const FadeInDown = styled.div`
  animation: ${fadeInDown} ${THEME.duration.normal} ${THEME.easing.smooth} forwards;
`;

export const FadeInLeft = styled.div`
  animation: ${fadeInLeft} ${THEME.duration.normal} ${THEME.easing.smooth} forwards;
`;

export const FadeInRight = styled.div`
  animation: ${fadeInRight} ${THEME.duration.normal} ${THEME.easing.smooth} forwards;
`;

// Scale animations
export const ScaleIn = styled.div`
  animation: ${scaleIn} ${THEME.duration.normal} ${THEME.easing.elastic} forwards;
`;

export const ScaleInBounce = styled.div`
  animation: ${scaleInBounce} ${THEME.duration.slow} ${THEME.easing.bounce} forwards;
`;

// Slide animations
export const SlideInUp = styled.div`
  animation: ${slideInUp} ${THEME.duration.normal} ${THEME.easing.smooth} forwards;
`;

export const SlideInDown = styled.div`
  animation: ${slideInDown} ${THEME.duration.normal} ${THEME.easing.smooth} forwards;
`;

export const SlideInLeft = styled.div`
  animation: ${slideInLeft} ${THEME.duration.normal} ${THEME.easing.smooth} forwards;
`;

export const SlideInRight = styled.div`
  animation: ${slideInRight} ${THEME.duration.normal} ${THEME.easing.smooth} forwards;
`;

// Interactive animations
export const Spinning = styled.div`
  animation: ${spin} 1s linear infinite;
`;

export const Pulsing = styled.div`
  animation: ${pulse} 2s ease-in-out infinite;
`;

export const Shaking = styled.div`
  animation: ${shake} 0.5s ease-in-out;
`;

export const Bouncing = styled.div`
  animation: ${bounce} 1s ease-in-out;
`;

// Glow effects
export const Glowing = styled.div`
  animation: ${glow} 2s ease-in-out infinite alternate;
`;

export const GlowingPulse = styled.div`
  animation: ${glowPulse} 1.5s ease-in-out infinite alternate;
`;

/* ─────────────────────────────────────────────────────────────
   Animation Mixins for Custom Components
───────────────────────────────────────────────────────────── */

export const animationMixin = (animationName, duration = THEME.duration.normal, easing = THEME.easing.smooth) => `
  animation: ${animationName} ${duration} ${easing} forwards;
`;

export const hoverMixin = (transform = 'translateY(-2px)', shadow = "var(--shadow-card, 0 18px 45px rgba(255,95,147,0.14))") => `
  transition: all ${THEME.duration.fast} ${THEME.easing.smooth};
  
  &:hover {
    transform: ${transform};
    box-shadow: ${shadow};
  }
  
  &:active {
    transform: translateY(0);
  }
`;

export const glassHoverMixin = () => `
  transition: all ${THEME.duration.fast} ${THEME.easing.smooth};
  
  &:hover {
    background: rgba(255, 255, 255, 0.95);
    border-color: var(--color-primary, #ff5f93);
    transform: translateY(-1px);
  }
`;

export const focusMixin = (color = "var(--color-primary, #ff5f93)") => `
  &:focus {
    outline: none;
    border-color: ${color};
    box-shadow: 0 0 0 4px rgba(0,0,0,0.06), 0 8px 20px rgba(0,0,0,0.08);
  }
`;

export const loadingMixin = (size = '20px') => `
  display: inline-block;
  width: ${size};
  height: ${size};
  border: 3px solid var(--color-border, rgba(255,95,147,0.18));
  border-radius: 50%;
  border-top-color: var(--color-primary, #ff5f93);
  animation: ${spin} 1s linear infinite;
`;

/* ─────────────────────────────────────────────────────────────
   Export Animation Utilities
───────────────────────────────────────────────────────────── */

export const getAnimationProps = (type, options = {}) => {
  const defaults = {
    duration: THEME.duration.normal,
    easing: THEME.easing.smooth,
    delay: '0s',
    fillMode: 'forwards',
    ...options
  };
  
  return {
    style: {
      animation: `${type} ${defaults.duration} ${defaults.easing} ${defaults.delay} ${defaults.fillMode}`,
    }
  };
};

export const getTransitionProps = (properties = 'all', options = {}) => {
  const defaults = {
    duration: THEME.duration.normal,
    easing: THEME.easing.smooth,
    delay: '0s',
    ...options
  };
  
  return {
    style: {
      transition: `${properties} ${defaults.duration} ${defaults.easing} ${defaults.delay}`,
    }
  };
};

export { THEME };

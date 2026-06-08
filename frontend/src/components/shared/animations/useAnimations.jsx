import { useState, useEffect, useRef } from 'react';
import { keyframes } from 'styled-components';
import { 
  fadeIn,
  scaleIn, scaleInBounce, slideInUp, slideInDown, slideInLeft, slideInRight,
  spin, pulse, shake, bounce, glow,
  getAnimationProps, getTransitionProps
} from './GlobalAnimations';

/* ─────────────────────────────────────────────────────────────
   Animation Hooks
───────────────────────────────────────────────────────────── */

/**
 * Hook for controlling animation states
 * @param {string} animationName - Name of the animation
 * @param {object} options - Animation options
 * @returns {object} Animation props and controls
 */
export const useAnimation = (animationName, options = {}) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);
  
  const startAnimation = () => {
    setIsAnimating(true);
    setHasAnimated(true);
    
    // Auto-stop animation after duration
    const duration = options.duration || '0.3s';
    const durationMs = parseFloat(duration) * 1000;
    
    setTimeout(() => {
      setIsAnimating(false);
    }, durationMs);
  };
  
  const resetAnimation = () => {
    setIsAnimating(false);
    setHasAnimated(false);
  };
  
  const animationProps = getAnimationProps(animationName, options);
  
  return {
    isAnimating,
    hasAnimated,
    startAnimation,
    resetAnimation,
    animationProps
  };
};

/**
 * Hook for intersection observer animations
 * @param {string} animationName - Animation to trigger on scroll
 * @param {object} options - Animation and observer options
 * @returns {object} Ref and animation state
 */
export const useScrollAnimation = (animationName, options = {}) => {
  const [isVisible, setIsVisible] = useState(false);
  const elementRef = useRef(null);
  
  const { threshold = 0.1, rootMargin = '0px', ...animationOptions } = options;
  
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold, rootMargin }
    );
    
    observer.observe(element);
    
    return () => observer.unobserve(element);
  }, [threshold, rootMargin]);
  
  const animationProps = isVisible 
    ? getAnimationProps(animationName, animationOptions)
    : { style: { opacity: 0 } };
  
  return {
    elementRef,
    isVisible,
    animationProps
  };
};

/**
 * Hook for hover animations
 * @param {object} hoverStyles - Styles to apply on hover
 * @param {object} options - Transition options
 * @returns {object} Style and event handlers
 */
export const useHoverAnimation = (hoverStyles, options = {}) => {
  const [isHovered, setIsHovered] = useState(false);
  
  const transitionProps = getTransitionProps('all', options);
  const baseStyles = { ...transitionProps.style };
  const combinedStyles = isHovered ? { ...baseStyles, ...hoverStyles } : baseStyles;
  
  const eventHandlers = {
    onMouseEnter: () => setIsHovered(true),
    onMouseLeave: () => setIsHovered(false),
    style: combinedStyles
  };
  
  return {
    isHovered,
    eventHandlers
  };
};

/**
 * Hook for loading animations
 * @param {boolean} isLoading - Loading state
 * @param {object} options - Animation options
 * @returns {object} Loading animation props
 */
export const useLoadingAnimation = (isLoading, options = {}) => {
  const loadingProps = isLoading 
    ? { style: { animation: `spin 1s linear infinite` } }
    : { style: { animation: 'none' } };
  
  return {
    isLoading,
    loadingProps
  };
};

/**
 * Hook for staggered animations
 * @param {number} itemCount - Number of items to animate
 * @param {string} animationName - Animation to use
 * @param {number} staggerDelay - Delay between items
 * @returns {function} Function to get animation props for each item
 */
export const useStaggeredAnimation = (itemCount, animationName, staggerDelay = 100) => {
  const [visibleItems, setVisibleItems] = useState(new Set());
  
  const startStaggeredAnimation = () => {
    for (let i = 0; i < itemCount; i++) {
      setTimeout(() => {
        setVisibleItems(prev => new Set([...prev, i]));
      }, i * staggerDelay);
    }
  };
  
  const getItemProps = (index) => {
    const isVisible = visibleItems.has(index);
    const delay = `${index * staggerDelay}ms`;
    
    return isVisible 
      ? getAnimationProps(animationName, { delay })
      : { style: { opacity: 0 } };
  };
  
  const resetAnimation = () => {
    setVisibleItems(new Set());
  };
  
  return {
    startStaggeredAnimation,
    resetAnimation,
    getItemProps,
    visibleItems: visibleItems.size
  };
};

/* ─────────────────────────────────────────────────────────────
   Animation Presets
───────────────────────────────────────────────────────────── */

export const animationPresets = {
  // Entry animations
  entry: {
    fadeIn: { animation: fadeIn, options: { duration: '0.6s' } },
    slideUp: { animation: slideInUp, options: { duration: '0.5s' } },
    slideDown: { animation: slideInDown, options: { duration: '0.5s' } },
    slideLeft: { animation: slideInLeft, options: { duration: '0.5s' } },
    slideRight: { animation: slideInRight, options: { duration: '0.5s' } },
    scaleIn: { animation: scaleIn, options: { duration: '0.4s' } },
    bounceIn: { animation: scaleInBounce, options: { duration: '0.8s' } }
  },
  
  // Exit animations
  exit: {
    fadeOut: { 
      animation: () => keyframes`
        from { opacity: 1; }
        to { opacity: 0; }
      `,
      options: { duration: '0.3s' }
    },
    slideUp: { 
      animation: () => keyframes`
        from { transform: translateY(0); opacity: 1; }
        to { transform: translateY(-20px); opacity: 0; }
      `,
      options: { duration: '0.3s' }
    }
  },
  
  // Interactive animations
  interactive: {
    hover: {
      styles: { transform: 'translateY(-2px)' },
      options: { duration: '0.2s' }
    },
    glow: {
      styles: { boxShadow: 'var(--shadow-primary, 0 0 20px rgba(0,0,0,0.18))' },
      options: { duration: '0.3s' }
    },
    scale: {
      styles: { transform: 'scale(1.05)' },
      options: { duration: '0.2s' }
    }
  },
  
  // Loading animations
  loading: {
    spin: { animation: spin, options: { duration: '1s' } },
    pulse: { animation: pulse, options: { duration: '2s' } },
    bounce: { animation: bounce, options: { duration: '1s' } }
  },
  
  // Attention animations
  attention: {
    shake: { animation: shake, options: { duration: '0.5s' } },
    bounce: { animation: bounce, options: { duration: '1s' } },
    glow: { animation: glow, options: { duration: '2s' } },
    pulse: { animation: pulse, options: { duration: '1.5s' } }
  }
};

/* ─────────────────────────────────────────────────────────────
   Animation Utilities
───────────────────────────────────────────────────────────── */

/**
 * Get preset animation props
 * @param {string} category - Animation category (entry, exit, interactive, etc.)
 * @param {string} name - Animation name within category
 * @param {object} customOptions - Override options
 * @returns {object} Animation props
 */
export const usePresetAnimation = (category, name, customOptions = {}) => {
  const preset = animationPresets[category]?.[name];
  
  if (!preset) {
    console.warn(`Animation preset not found: ${category}.${name}`);
    return { style: {} };
  }
  
  const { animation, options } = preset;
  const mergedOptions = { ...options, ...customOptions };
  
  return getAnimationProps(animation, mergedOptions);
};

/**
 * Create animated component wrapper
 * @param {React.Component} Component - Component to wrap
 * @param {string} animationName - Animation to apply
 * @param {object} options - Animation options
 * @returns {React.Component} Animated component
 */
export const withAnimation = (Component, animationName, options = {}) => {
  return function AnimatedComponent(props) {
    const { animationProps } = useAnimation(animationName, options);
    
    return (
      <div {...animationProps}>
        <Component {...props} />
      </div>
    );
  };
};

/**
 * Create scroll-triggered animated component
 * @param {React.Component} Component - Component to wrap
 * @param {string} animationName - Animation to apply
 * @param {object} options - Animation and observer options
 * @returns {React.Component} Animated component
 */
export const withScrollAnimation = (Component, animationName, options = {}) => {
  return function ScrollAnimatedComponent(props) {
    const { elementRef, animationProps } = useScrollAnimation(animationName, options);
    
    return (
      <div ref={elementRef} {...animationProps}>
        <Component {...props} />
      </div>
    );
  };
};

export const clyEasing = {
  enter: [0.16, 1, 0.3, 1] as const,
  exit: [0.4, 0, 1, 1] as const,
  move: [0.22, 1, 0.36, 1] as const,
  emphasis: [0.34, 1.56, 0.64, 1] as const,
};

export const clyMotion = {
  immediate: { duration: 0.1, ease: clyEasing.move },
  fast: { duration: 0.12, ease: clyEasing.move },
  small: { duration: 0.18, ease: clyEasing.enter },
  panel: { duration: 0.22, ease: clyEasing.enter },
  structural: { duration: 0.28, ease: clyEasing.move },
};

export const clyFadeSlide = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 4 },
};

export const reducedFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

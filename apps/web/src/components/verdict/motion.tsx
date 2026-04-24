"use client";

import {
  motion,
  useReducedMotion,
  useInView,
  type HTMLMotionProps,
} from "framer-motion";
import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Motion primitives used across Verdict.
 *
 * They all respect `prefers-reduced-motion` via Framer's `useReducedMotion`
 * so the user's system setting disables fades and stagger automatically.
 */

type FadeInProps = HTMLMotionProps<"div"> & {
  delay?: number;
  y?: number;
};

export function FadeIn({
  delay = 0,
  y = 8,
  children,
  ...rest
}: FadeInProps) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y }}
      animate={reduced ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: "easeOut" }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

interface StaggerProps {
  children: ReactNode;
  className?: string;
  step?: number;
  initialDelay?: number;
}

/**
 * Renders each direct child wrapped in a fade+rise motion.div with a
 * step between them. Use for card grids, lists — anywhere you want a
 * quiet cascade on mount.
 */
export function Stagger({
  children,
  className,
  step = 0.06,
  initialDelay = 0,
}: StaggerProps) {
  const reduced = useReducedMotion();
  const array = Children.toArray(children);

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div className={className}>
      {array.map((child, i) => (
        <motion.div
          key={isValidElement(child) && child.key !== null ? child.key : i}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.35,
            delay: initialDelay + i * step,
            ease: "easeOut",
          }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
}

interface CounterProps {
  value: number;
  duration?: number;
  className?: string;
}

/**
 * Rolls a number from 0 → `value` when it enters view. Falls back to
 * the final value under reduced motion.
 */
export function Counter({ value, duration = 1.2, className }: CounterProps) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -20% 0px" });
  const [display, setDisplay] = useState(reduced ? value : 0);

  useEffect(() => {
    if (!inView || reduced) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(eased * value));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, value, duration, reduced]);

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
}

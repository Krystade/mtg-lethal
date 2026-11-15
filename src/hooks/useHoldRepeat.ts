import { useCallback, useEffect, useRef } from "react";

/** Before a held + / − starts repeating, and then between repeats. Were 450 / 200. */
export const HOLD_DELAY_MS = 500;
export const HOLD_STEP_MS = 300;

/**
 * Pointer handlers for a +/- control: a press applies `amountFor(event)` at
 * once, and holding repeats that same amount every HOLD_STEP_MS after
 * HOLD_DELAY_MS. `onDelta` receives the signed amount to apply.
 */
export function useHoldRepeat(
  onDelta: (amount: number) => void,
  amountFor: (e: React.PointerEvent<HTMLElement>) => number,
) {
  const timerRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Stop any pending repeat if the component unmounts mid-hold.
  useEffect(() => stop, [stop]);

  const start = useCallback(
    (amount: number) => {
      stop();
      onDelta(amount);
      const repeat = () => {
        onDelta(amount);
        timerRef.current = window.setTimeout(repeat, HOLD_STEP_MS);
      };
      timerRef.current = window.setTimeout(repeat, HOLD_DELAY_MS);
    },
    [onDelta, stop],
  );

  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      start(amountFor(e));
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.stopPropagation();
      stop();
    },
    onPointerLeave: stop,
    onPointerCancel: stop,
  };
}

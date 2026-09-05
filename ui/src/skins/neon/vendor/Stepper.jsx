/**
 * React Bits Stepper — patched: real <button>s for the step indicators
 * (keyboard reachable, aria-current), namespaced classes (`nl-step*`), no
 * forced aspect-ratio box, and the final action can be a link (`finalHref`)
 * so "complete" takes the visitor somewhere honest instead of collapsing.
 */
import React, { useState, Children, useRef, useLayoutEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import './Stepper.css';

export default function Stepper({
  children,
  initialStep = 1,
  onStepChange = () => {},
  backButtonText = 'Back',
  nextButtonText = 'Next',
  finalLabel = 'Finish',
  finalHref,
  finalProps = {},
  reduced = false,
  className = '',
}) {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [direction, setDirection] = useState(0);
  const steps = Children.toArray(children);
  const total = steps.length;
  const isLast = currentStep === total;

  const go = (n) => {
    if (n < 1 || n > total || n === currentStep) return;
    setDirection(n > currentStep ? 1 : -1);
    setCurrentStep(n);
    onStepChange(n);
  };

  return (
    <div className={`nl-stepper ${className}`}>
      <div className="nl-stepper__row" role="tablist" aria-label="Steps">
        {steps.map((_, i) => {
          const n = i + 1;
          return (
            <React.Fragment key={n}>
              <StepIndicator step={n} currentStep={currentStep} onClick={() => go(n)} reduced={reduced} />
              {i < total - 1 && <StepConnector complete={currentStep > n} />}
            </React.Fragment>
          );
        })}
      </div>
      <StepContent currentStep={currentStep} direction={direction} reduced={reduced}>
        {steps[currentStep - 1]}
      </StepContent>
      <div className={`nl-stepper__nav ${currentStep !== 1 ? 'is-spread' : 'is-end'}`}>
        {currentStep !== 1 && (
          <button type="button" className="nl-stepper__back cursor-target" onClick={() => go(currentStep - 1)}>{backButtonText}</button>
        )}
        {isLast && finalHref ? (
          <a href={finalHref} className="nl-btn nl-btn--primary nl-stepper__next cursor-target" {...finalProps}>{finalLabel}</a>
        ) : (
          <button type="button" className="nl-btn nl-btn--primary nl-stepper__next cursor-target" onClick={() => go(currentStep + 1)}>
            {isLast ? finalLabel : nextButtonText}
          </button>
        )}
      </div>
    </div>
  );
}

function StepContent({ currentStep, direction, children, reduced }) {
  const [height, setHeight] = useState('auto');
  const onHeight = useCallback((h) => setHeight(h), []);
  return (
    <motion.div className="nl-stepper__content" animate={{ height }} transition={reduced ? { duration: 0 } : { type: 'spring', duration: 0.45, bounce: 0 }}>
      <AnimatePresence initial={false} mode="sync" custom={direction}>
        <Slide key={currentStep} direction={direction} onHeight={onHeight} reduced={reduced}>{children}</Slide>
      </AnimatePresence>
    </motion.div>
  );
}

function Slide({ children, direction, onHeight, reduced }) {
  const ref = useRef(null);
  useLayoutEffect(() => { if (ref.current) onHeight(ref.current.offsetHeight); }, [children, onHeight]);
  const variants = reduced
    ? { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } }
    : { enter: (d) => ({ x: d >= 0 ? '40%' : '-40%', opacity: 0 }), center: { x: '0%', opacity: 1 }, exit: (d) => ({ x: d >= 0 ? '-30%' : '30%', opacity: 0 }) };
  return (
    <motion.div ref={ref} className="nl-stepper__slide" custom={direction} variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: reduced ? 0 : 0.38, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

export function Step({ children }) {
  return <div className="nl-stepper__step">{children}</div>;
}

function StepIndicator({ step, currentStep, onClick, reduced }) {
  const status = currentStep === step ? 'active' : currentStep < step ? 'inactive' : 'complete';
  return (
    <button type="button" role="tab" aria-selected={status === 'active'} aria-current={status === 'active' ? 'step' : undefined} className={`nl-stepper__dot is-${status} cursor-target`} onClick={onClick} aria-label={`Step ${step}`}>
      <motion.span className="nl-stepper__dot-inner" initial={false} animate={{ scale: status === 'active' ? 1.08 : 1 }} transition={{ duration: reduced ? 0 : 0.3 }}>
        {status === 'complete' ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
            <motion.path initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.1, duration: reduced ? 0 : 0.3, ease: 'easeOut' }} strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <span className="nl-stepper__num">{String(step).padStart(2, '0')}</span>
        )}
      </motion.span>
    </button>
  );
}

function StepConnector({ complete }) {
  return (
    <div className="nl-stepper__line" aria-hidden="true">
      <motion.div className="nl-stepper__line-fill" initial={false} animate={{ width: complete ? '100%' : '0%' }} transition={{ duration: 0.4 }} />
    </div>
  );
}

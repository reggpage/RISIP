import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';

const LENGTH = 6;

export default function OtpInput({
  value,
  onChange,
  onComplete,
  disabled,
  error,
  length = LENGTH,
}: {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  error?: boolean;
  length?: number;
}) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const [focused, setFocused] = useState(0);

  // Keep the tracked value length at exactly LENGTH so per-cell rendering is stable.
  const cells = value.padEnd(length, ' ').slice(0, length).split('');

  useEffect(() => {
    if (value.length === length) onComplete?.(value);
  }, [value, length, onComplete]);

  function writeDigit(idx: number, digit: string) {
    const clean = digit.replace(/\D/g, '').slice(0, 1);
    if (!clean) return;
    const next = (value.slice(0, idx) + clean + value.slice(idx + 1)).slice(0, length);
    onChange(next);
    if (idx < length - 1) inputs.current[idx + 1]?.focus();
  }

  function handleKey(idx: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (cells[idx].trim()) {
        onChange(value.slice(0, idx) + value.slice(idx + 1));
      } else if (idx > 0) {
        inputs.current[idx - 1]?.focus();
        onChange(value.slice(0, idx - 1) + value.slice(idx));
      }
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      inputs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx < length - 1) {
      inputs.current[idx + 1]?.focus();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    inputs.current[Math.min(pasted.length, length - 1)]?.focus();
  }

  return (
    <div className="flex justify-center gap-2" onPaste={handlePaste}>
      {cells.map((cell, idx) => (
        <input
          key={idx}
          ref={(el) => (inputs.current[idx] = el)}
          value={cell.trim()}
          onChange={(e) => writeDigit(idx, e.target.value.slice(-1))}
          onKeyDown={(e) => handleKey(idx, e)}
          onFocus={() => setFocused(idx)}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={idx === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          aria-label={`Tarakimu ${idx + 1}`}
          className={
            'h-12 w-10 rounded-lg border text-center text-lg font-semibold tabular-nums text-ink ' +
            'focus:outline-none focus:ring-2 focus:ring-role-admin/30 ' +
            (error
              ? 'border-red-500'
              : focused === idx
                ? 'border-role-admin'
                : 'border-surface-border')
          }
        />
      ))}
    </div>
  );
}

export const OTP_LENGTH = LENGTH;

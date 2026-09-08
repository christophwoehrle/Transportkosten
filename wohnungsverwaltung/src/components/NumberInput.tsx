import * as React from "react";
import { Input } from "@/components/ui/input";
import { parseNumber } from "@/lib/utils";

interface Props
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: number | null;
  onValueChange: (value: number | null) => void;
}

/**
 * Zahleneingabe mit deutschem Format. Hält den Rohtext lokal, damit
 * Zwischenzustände (z. B. "12,") nicht springen, und meldet die geparste Zahl.
 */
export const NumberInput = React.forwardRef<HTMLInputElement, Props>(
  ({ value, onValueChange, ...props }, ref) => {
    const [text, setText] = React.useState<string>(
      value == null ? "" : String(value).replace(".", ",")
    );

    // Externe Änderungen übernehmen, wenn sie vom lokalen Wert abweichen.
    React.useEffect(() => {
      const parsed = parseNumber(text);
      if (parsed !== value) {
        setText(value == null ? "" : String(value).replace(".", ","));
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    return (
      <Input
        ref={ref}
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          onValueChange(parseNumber(raw));
        }}
        {...props}
      />
    );
  }
);
NumberInput.displayName = "NumberInput";

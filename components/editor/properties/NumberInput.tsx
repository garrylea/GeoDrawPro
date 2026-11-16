import React, { useState } from 'react';

interface NumberInputProps {
    value: number;
    onChange: (val: number) => void;
    className?: string;
    step?: string;
    placeholder?: string;
    title?: string;
}

/** Numeric field with local draft state (moved verbatim from PropertiesPanel.tsx, S10). */
export const NumberInput: React.FC<NumberInputProps> = ({ value, onChange, className, step = "0.1", placeholder, title }) => {
    const [localValue, setLocalValue] = useState<string>(value.toString());

    React.useEffect(() => {
        setLocalValue(value.toString());
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVal = e.target.value;
        setLocalValue(newVal);
        const parsed = parseFloat(newVal);
        if (!isNaN(parsed)) {
            onChange(parsed);
        } else if (newVal === '' || newVal === '-') {
            // Allow empty or negative sign without updating parent yet (or update to 0 if preferred, but usually better to wait)
            // If we don't update parent, the chart won't update while typing "-", which is fine.
        }
    };

    const handleBlur = () => {
        const parsed = parseFloat(localValue);
        if (isNaN(parsed)) {
            setLocalValue(value.toString()); // Revert to last valid prop value
        } else {
             // Ensure parent is definitely synced (though likely already done via change)
             onChange(parsed);
        }
    };

    return (
        <input 
            type="number" 
            step={step}
            value={localValue} 
            onFocus={(e) => e.target.select()}
            onChange={handleChange}
            onBlur={handleBlur}
            className={className} 
            placeholder={placeholder}
            title={title}
        />
    );
};
NumberInput.displayName = 'NumberInput';

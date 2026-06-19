import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { inputClass } from './FormFields';

export default function PasswordField({ value, onChange, required = false, autoComplete = 'current-password', placeholder = '' }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        className={`${inputClass} pr-11`}
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
        aria-label={visible ? 'Hide password' : 'Show password'}
        title={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}

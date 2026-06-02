interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export default function ToggleSwitch({ checked, onChange }: ToggleSwitchProps) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      {/* Track */}
      <div
        className="w-9 h-5 border-2 border-white transition-colors duration-100 peer-checked:bg-[#7c3aed] bg-[#1a1a1a]"
        style={{ borderRadius: '2px' }}
      >
        {/* Thumb */}
        <div
          className={`absolute top-[3px] w-3 h-3 bg-white transition-transform duration-100 ${
            checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
          }`}
          style={{ borderRadius: '1px' }}
        />
      </div>
    </label>
  );
}

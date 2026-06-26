// Input số tiền hiển thị có dấu phân nghìn (VD: 556.000) nhưng value/onChange vẫn là number thuần.
export default function MoneyInput({ value, onChange, className = "", disabled, placeholder }) {
  const display = value || value === 0 ? Number(value).toLocaleString("vi-VN") : "";

  function handleChange(e) {
    const digits = e.target.value.replace(/\D/g, "");
    onChange(digits ? Number(digits) : 0);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      onChange={handleChange}
      disabled={disabled}
      placeholder={placeholder}
      className={className}
    />
  );
}

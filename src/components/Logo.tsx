export function Logo({ size = 36 }: { size?: number }) {
  return (
    <span className="logo" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none">
        <path
          d="M8 8.5 24 23.5M24 8.5 8 23.5"
          stroke="white"
          strokeWidth="3.4"
          strokeLinecap="round"
        />
        <circle cx="23.4" cy="8.6" r="2.4" fill="#7ef0d4" />
      </svg>
    </span>
  );
}

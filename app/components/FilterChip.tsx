'use client';

export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button className={active ? 'fchip active' : 'fchip'} onClick={onClick} aria-pressed={active}>
      {children}
    </button>
  );
}

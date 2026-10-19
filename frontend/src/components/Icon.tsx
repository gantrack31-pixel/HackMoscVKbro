import { icons } from "./iconRegistry";

export type IconName = keyof typeof icons;
export function Icon({
  name,
  className = "",
  size,
}: {
  name: IconName;
  className?: string;
  size?: number;
}) {
  const Component = icons[name];
  return (
    <Component
      className={`icon ${className}`}
      data-icon={name}
      aria-hidden="true"
      strokeWidth={1.7}
      size={size}
      style={size ? { width: size, height: size } : undefined}
    />
  );
}

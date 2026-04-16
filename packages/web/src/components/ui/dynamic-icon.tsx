import * as Icons from 'lucide-react';

function toPascalCase(kebab: string) {
  return kebab.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

interface DynamicIconProps {
  name: string;
  className?: string;
}

export function DynamicIcon({ name, className }: DynamicIconProps) {
  const iconName = toPascalCase(name);
  const Icon = (Icons as Record<string, unknown>)[iconName] as React.ComponentType<{ className?: string }> | undefined;
  if (!Icon) return null;
  return <Icon className={className} />;
}

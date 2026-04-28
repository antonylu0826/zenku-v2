import type React from 'react';
import { Toaster as Sonner } from 'sonner';
import { useTheme } from '../layout/ThemeProvider';

type ToasterProps = React.ComponentProps<typeof Sonner>;

function Toaster({ ...props }: Omit<ToasterProps, 'theme'>) {
  const { theme } = useTheme();
  return <Sonner theme={theme} richColors closeButton {...props} />;
}

export { Toaster };

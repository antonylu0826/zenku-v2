import type React from 'react';
import { Toaster as Sonner } from 'sonner';
import { useTheme } from '../layout/ThemeProvider';

type ToasterProps = React.ComponentProps<typeof Sonner>;

function Toaster({ ...props }: Omit<ToasterProps, 'theme'>) {
  const { theme } = useTheme();
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl group-[.toaster]:px-4 group-[.toaster]:py-3',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground font-medium',
          cancelButton:
            'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground font-medium',
          closeButton:
            'group-[.toast]:bg-background group-[.toast]:text-foreground group-[.toast]:border-border',
        },
      }}
      closeButton
      {...props}
    />
  );
}

export { Toaster };

import type * as React from 'react';
import { cn } from '../../lib/cn';

function FormItem({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('space-y-2', className)} {...props} />;
}

function FormMessage({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm font-medium text-destructive', className)} {...props} />;
}

export { FormItem, FormMessage };

import React, { useMemo } from 'react';
import { Check, CircleDot, Circle } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface StateMachineConfig {
  status_field: string;
  initial_state: string;
  states: Record<string, { label: string; is_editable?: boolean; is_final?: boolean; color?: string }>;
  transitions: Record<string, string[]>;
  allow_delete_in?: string[];
}

interface StatusStepperProps {
  currentStatus: string;
  config: StateMachineConfig;
  className?: string;
}

export function StatusStepper({ currentStatus, config, className }: StatusStepperProps) {
  // Compute linear ordering of states for the UI
  const linearStates = useMemo(() => {
    const visited = new Set<string>();
    const result: string[] = [];
    const queue = [config.initial_state];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (!visited.has(curr)) {
        visited.add(curr);
        result.push(curr);
        const nexts = config.transitions[curr] || [];
        for (const next of nexts) {
          if (!visited.has(next) && !queue.includes(next)) {
            queue.push(next);
          }
        }
      }
    }
    // Add any missing states
    for (const s of Object.keys(config.states)) {
      if (!visited.has(s)) result.push(s);
    }
    return result;
  }, [config]);

  const currentIndex = linearStates.indexOf(currentStatus);

  return (
    <div className={cn('flex items-center gap-2 overflow-x-auto py-2', className)}>
      {linearStates.map((stateKey, index) => {
        const stateDef = config.states[stateKey];
        if (!stateDef) return null; // Safe guard

        const isPast = currentIndex > -1 && index < currentIndex;
        const isCurrent = stateKey === currentStatus;

        // Custom color
        const color = stateDef.color || '#3b82f6'; // default blue

        return (
          <React.Fragment key={stateKey}>
            {index > 0 && (
              <div 
                className={cn('h-[2px] w-8 sm:w-12 transition-colors', isPast ? 'bg-primary' : 'bg-muted')} 
                style={isPast ? { backgroundColor: color } : undefined}
              />
            )}
            <div className="flex flex-col items-center gap-1 min-w-[60px]">
              <div 
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all',
                  isPast ? 'bg-primary border-primary text-primary-foreground' :
                  isCurrent ? 'border-primary bg-background text-primary' :
                  'border-muted bg-background text-muted-foreground'
                )}
                style={
                  isPast ? { backgroundColor: color, borderColor: color } :
                  isCurrent ? { borderColor: color, color: color } :
                  undefined
                }
              >
                {isPast ? <Check className="h-4 w-4" /> : isCurrent ? <CircleDot className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
              </div>
              <span 
                className={cn(
                  'text-xs font-medium text-center',
                  isPast || isCurrent ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {stateDef.label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

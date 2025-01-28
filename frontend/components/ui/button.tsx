import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        default:
          "bg-accent-primary text-white hover:bg-accent-primary/90 dark:bg-accent-primary dark:hover:bg-accent-primary/90",
        destructive:
          "bg-accent-error text-white hover:bg-accent-error/90 dark:bg-accent-error dark:hover:bg-accent-error/90",
        outline:
          "border border-dark-border bg-transparent hover:bg-dark-secondary/10 dark:border-dark-border dark:hover:bg-dark-secondary/10",
        secondary:
          "bg-dark-secondary text-dark-text-primary hover:bg-dark-secondary/80 dark:bg-dark-secondary dark:hover:bg-dark-secondary/80",
        ghost:
          "hover:bg-dark-secondary/10 hover:text-dark-text-primary dark:hover:bg-dark-secondary/10 dark:hover:text-dark-text-primary",
        link: "text-accent-primary underline-offset-4 hover:underline",
        success:
          "bg-accent-success text-white hover:bg-accent-success/90 dark:bg-accent-success dark:hover:bg-accent-success/90",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";

export { Button, buttonVariants };

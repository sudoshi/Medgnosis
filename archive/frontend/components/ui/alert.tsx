import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-dark-text-secondary",
  {
    variants: {
      variant: {
        default: "bg-light-primary text-dark-text-primary dark:bg-dark-primary",
        destructive:
          "border-accent-error/50 text-accent-error dark:border-accent-error [&>svg]:text-accent-error",
        success:
          "border-accent-success/50 text-accent-success dark:border-accent-success [&>svg]:text-accent-success",
        warning:
          "border-accent-warning/50 text-accent-warning dark:border-accent-warning [&>svg]:text-accent-warning",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const Alert = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(alertVariants({ variant }), className)}
    role="alert"
    {...props}
  />
));

Alert.displayName = "Alert";

const AlertTitle = forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none tracking-tight", className)}
    {...props}
  />
));

AlertTitle.displayName = "AlertTitle";

const AlertDescription = forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
));

AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };

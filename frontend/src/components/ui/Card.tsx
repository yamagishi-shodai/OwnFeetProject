import { HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLDivElement>;

export function Card({ className = "", children, ...props }: Props) {
  return (
    <div
      className={`bg-warm-card border border-border-default rounded-2xl p-5 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardSection({ className = "", children, ...props }: Props) {
  return (
    <section className={`${className}`} {...props}>
      {children}
    </section>
  );
}

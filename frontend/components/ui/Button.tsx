// frontend/components/ui/Button.tsx
"use client";

import Link from "next/link";
import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode, AnchorHTMLAttributes } from "react";

/**
 * Botão primitivo do design system.
 * Variants: primary | secondary | ghost | destructive | whatsapp | link
 * Sizes: sm (32px) | md (40px) | lg (48px — default mobile)
 *
 * Usar como <button> ou como <a>/Link com prop href.
 */

type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "destructive"
  | "whatsapp"
  | "link";

type ButtonSize = "sm" | "md" | "lg";

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  children: ReactNode;
  className?: string;
};

type ButtonAsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> & {
    href?: undefined;
  };

type ButtonAsLink = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof CommonProps> & {
    href: string;
    target?: string;
    rel?: string;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-white hover:bg-primary-strong active:bg-primary-strong shadow-sm",
  secondary:
    "bg-white text-cnc-text border border-cnc-line hover:border-cnc-line-strong hover:bg-cnc-bg",
  ghost: "bg-transparent text-cnc-text hover:bg-cnc-bg",
  destructive:
    "bg-cnc-danger text-white hover:bg-cnc-danger/90 active:bg-cnc-danger/95 shadow-sm",
  whatsapp:
    "bg-cnc-success text-white hover:bg-cnc-success/90 active:bg-cnc-success/95 shadow-sm",
  link: "bg-transparent text-primary hover:text-primary-strong underline-offset-4 hover:underline px-0",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2 md:text-[15px]",
  lg: "h-12 px-5 text-base gap-2",
};

const BASE_CLASSES =
  "inline-flex items-center justify-center rounded-md font-semibold tracking-normalish transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50";

function buildClassName({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}) {
  return [
    BASE_CLASSES,
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    fullWidth ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

function ButtonContent({
  loading,
  iconLeft,
  iconRight,
  children,
}: Pick<CommonProps, "loading" | "iconLeft" | "iconRight" | "children">) {
  return (
    <>
      {loading ? (
        <span
          aria-hidden="true"
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        iconLeft
      )}
      <span className="truncate">{children}</span>
      {!loading && iconRight}
    </>
  );
}

export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  function Button(props, ref) {
    if ("href" in props && props.href !== undefined) {
      const {
        variant = "primary",
        size = "md",
        fullWidth = false,
        loading = false,
        iconLeft,
        iconRight,
        children,
        className,
        href,
        target,
        rel,
        ...rest
      } = props as ButtonAsLink;
      const cls = buildClassName({ variant, size, fullWidth, className });
      const computedRel = target === "_blank" ? rel ?? "noopener noreferrer" : rel;
      return (
        <Link
          href={href}
          target={target}
          rel={computedRel}
          ref={ref as React.Ref<HTMLAnchorElement>}
          className={cls}
          aria-disabled={loading || undefined}
          {...rest}
        >
          <ButtonContent loading={loading} iconLeft={iconLeft} iconRight={iconRight}>
            {children}
          </ButtonContent>
        </Link>
      );
    }

    const {
      variant = "primary",
      size = "md",
      fullWidth = false,
      loading = false,
      iconLeft,
      iconRight,
      children,
      className,
      type = "button",
      disabled,
      ...rest
    } = props as ButtonAsButton;
    const cls = buildClassName({ variant, size, fullWidth, className });
    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type={type}
        disabled={disabled || loading}
        className={cls}
        {...rest}
      >
        <ButtonContent loading={loading} iconLeft={iconLeft} iconRight={iconRight}>
          {children}
        </ButtonContent>
      </button>
    );
  }
);

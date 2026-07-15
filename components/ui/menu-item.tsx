"use client";

import {
  createContext,
  useContext,
  useRef,
  useEffect,
  forwardRef,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import type { IconComponent } from "~/lib/icon-context";
import { cn } from "~/lib/utils";
import { shapeMap } from "~/lib/shape-context";

// MenuItem is only used inside Dropdown, which opts out of the global pill
// shape — see dropdown.tsx for the rationale.
const shape = shapeMap.rounded;

// ---------------------------------------------------------------------------
// Dropdown context — THE single shared context for both dropdown flavors.
//
// It lives here (the file both flavor registry entries ship) rather than in
// either dropdown module so that (a) MenuItem stays primitive-free and
// self-contained for registry consumers, and (b) the two flavors can render
// side by side (e.g. /compare-bases) — each provides this same context
// object, so MenuItem resolves whichever provider actually wraps it instead
// of guessing from a global flavor switch. Both dropdown flavors re-export
// useDropdown from here, keeping their public API unchanged.
// ---------------------------------------------------------------------------

/** What MenuItem hands to the popup's primitive wrapper. `element` is the
 *  styled row div (visuals + proximity registration, no children); `children`
 *  is the row content (icon, label, check). The flavor wraps them in its own
 *  Item / RadioItem, so MenuItem itself stays primitive-free. */
export interface MenuItemRenderOptions {
  /** Radio-style option (boolean `checked` on MenuItem) vs plain action item. */
  radio: boolean;
  /** The item's index — doubles as the radio value. */
  value: number;
  disabled?: boolean;
  label: string;
  closeOnClick: boolean;
  element: ReactElement;
  children: ReactNode;
}

export interface DropdownContextValue {
  registerItem: (index: number, element: HTMLElement | null) => void;
  activeIndex: number | null;
  checkedIndex?: number;
  /** True when items render inside a Menu popup (DropdownContent), where the
   *  primitive's Item / RadioItem own roles, roving highlight, typeahead,
   *  and activation. MenuItem switches its rendering accordingly. */
  inMenu?: boolean;
  /** Popup-only: wraps a MenuItem's styled div in this flavor's menu-item
   *  primitive. Absent in the inline Dropdown panel, where MenuItem renders
   *  its own ARIA menuitem div. */
  renderMenuItem?: (opts: MenuItemRenderOptions) => ReactElement;
}

export const DropdownContext = createContext<DropdownContextValue | null>(null);

export function useDropdown() {
  const ctx = useContext(DropdownContext);
  if (!ctx) throw new Error("useDropdown must be used within a Dropdown");
  return ctx;
}

/** Null-safe context read for callers that render outside a provider. */
export function useDropdownMaybe() {
  return useContext(DropdownContext);
}

interface MenuItemProps extends HTMLAttributes<HTMLDivElement> {
  /** Optional leading icon. When omitted, the row renders text-only with no
   *  reserved icon column. */
  icon?: IconComponent;
  label: string;
  index: number;
  /** When a boolean, the item is a radio-style option (role="menuitemradio"
   *  with aria-checked). When undefined, it is a plain action item
   *  (role="menuitem", no checked state announced). */
  checked?: boolean;
  onSelect?: () => void;
  disabled?: boolean;
  /** Popup-only (inside DropdownContent): whether activating the item closes
   *  the menu. Ignored in the inline Dropdown panel. @default true */
  closeOnClick?: boolean;
}

const MenuItem = forwardRef<HTMLDivElement, MenuItemProps>(
  (
    {
      icon: Icon,
      label,
      index,
      checked,
      onSelect,
      disabled,
      closeOnClick,
      className,
      onClick,
      ...props
    },
    ref
  ) => {
    const internalRef = useRef<HTMLDivElement>(null);
    const { registerItem, activeIndex, checkedIndex, renderMenuItem } =
      useDropdown();

    useEffect(() => {
      registerItem(index, internalRef.current);
      return () => registerItem(index, null);
    }, [index, registerItem]);

    const isActive = activeIndex === index;

    const mergeRef = (node: HTMLDivElement | null) => {
      (internalRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    };

    const handleActivate = disabled
      ? undefined
      : (e: React.MouseEvent<HTMLDivElement>) => {
          onClick?.(e);
          onSelect?.();
        };

    const itemClassName = cn(
      // Fixed height (was py-2 around a 19.5px line box ≈ 35.5px) so the
      // text-box trim on the label doesn't shrink the row.
      `relative z-10 flex h-11 items-center gap-2 ${shape.item} px-2 cursor-pointer outline-none`,
      disabled && "opacity-50 pointer-events-none",
      className
    );

    const content = (
      <>
        {Icon && (
          <Icon
            size={16}
            strokeWidth={1.5}
            className={cn(
              isActive || checked
                ? "text-foreground"
                : "text-muted-foreground"
            )}
          />
        )}
        {/* Selection is communicated by color, never a weight change. */}
        <span className="flex-1 text-[14px]">
          <span
            className={cn(
              "[text-box:trim-both_cap_alphabetic]",
              isActive || checked
                ? "text-foreground"
                : "text-muted-foreground"
            )}
          >
            {label}
          </span>
        </span>
        {checked && (
            <svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-foreground shrink-0"
            >
              <path d="M4 12L9 17L20 6" />
            </svg>
        )}
      </>
    );

    if (renderMenuItem) {
      // Inside DropdownContent, the flavor's menu-item primitive (supplied by
      // the surrounding DropdownContent through context) owns the role,
      // aria-checked, tabIndex, roving highlight, typeahead, and Enter/Space/
      // click activation (activation synthesizes a click, so handleActivate
      // also fires for keyboard). The styled div carries the Fluid
      // Functionalism visuals and the proximity-hover registration; MenuItem
      // itself imports no primitive.
      return renderMenuItem({
        radio: typeof checked === "boolean",
        value: index,
        disabled,
        label,
        closeOnClick: closeOnClick ?? true,
        element: (
          <div
            ref={mergeRef}
            data-proximity-index={index}
            aria-label={label}
            onClick={handleActivate}
            className={itemClassName}
            {...props}
          />
        ),
        children: content,
      });
    }

    return (
      <div
        ref={mergeRef}
        data-proximity-index={index}
        // Disabled items are never the roving tab stop.
        tabIndex={!disabled && index === (checkedIndex ?? 0) ? 0 : -1}
        role={typeof checked === "boolean" ? "menuitemradio" : "menuitem"}
        aria-checked={typeof checked === "boolean" ? checked : undefined}
        aria-disabled={disabled || undefined}
        aria-label={label}
        onClick={handleActivate}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            onSelect?.();
          }
        }}
        className={itemClassName}
        {...props}
      >
        {content}
      </div>
    );
  }
);

MenuItem.displayName = "MenuItem";

export { MenuItem };
export default MenuItem;

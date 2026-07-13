import {
  forwardRef,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { cn } from "../lib/cn";

export interface AutocompleteOption {
  value: string;
  label: string;
  detail?: string;
  meta?: ReactNode;
}

export interface AutocompleteProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onSelect"> {
  label?: string;
  error?: string;
  value: string;
  options: AutocompleteOption[];
  onValueChange: (value: string) => void;
  onOptionSelect: (option: AutocompleteOption) => void;
  hint?: string;
  emptyText?: string;
  loading?: boolean;
}

export const Autocomplete = forwardRef<HTMLInputElement, AutocompleteProps>(function Autocomplete(
  {
    className,
    label,
    error,
    id,
    value,
    options,
    onValueChange,
    onOptionSelect,
    hint = "Use ↑ ↓ para navegar, Enter para selecionar e Esc para fechar.",
    emptyText = "Nenhum resultado encontrado.",
    loading = false,
    onKeyDown,
    onFocus,
    ...props
  },
  forwardedRef,
) {
  const generatedId = useId();
  const inputId = id ?? props.name ?? generatedId;
  const listId = `${inputId}-listbox`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const hasQuery = value.trim().length > 0;
  const shouldShowList = open && hasQuery;

  useImperativeHandle(forwardedRef, () => inputRef.current as HTMLInputElement);

  useEffect(() => {
    setActiveIndex(0);
  }, [options.length, value]);

  function select(option: AutocompleteOption) {
    onOptionSelect(option);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      if (options.length) setActiveIndex((current) => Math.min(options.length - 1, current + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (options.length) setActiveIndex((current) => Math.max(0, current - 1));
      return;
    }
    if (event.key === "Enter" && open && options[activeIndex]) {
      event.preventDefault();
      select(options[activeIndex]);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Backspace") {
      event.preventDefault();
      onValueChange("");
      setOpen(false);
      return;
    }
    onKeyDown?.(event);
  }

  return (
    <div className="relative grid min-w-0 gap-1.5 text-sm text-slate-700">
      {label ? (
        <label className="font-medium" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <input
        ref={inputRef}
        id={inputId}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shouldShowList}
        aria-controls={listId}
        aria-activedescendant={shouldShowList ? `${listId}-${activeIndex}` : undefined}
        className={cn(
          "h-10 w-full min-w-0 rounded-md border border-[var(--brand-border)] bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[color:rgba(245,195,74,0.2)]",
          error && "border-rose-300 focus:border-rose-400 focus:ring-rose-100",
          className,
        )}
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value);
          setOpen(true);
        }}
        onFocus={(event) => {
          setOpen(true);
          onFocus?.(event);
        }}
        onKeyDown={handleKeyDown}
        {...props}
      />
      {shouldShowList ? (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-[var(--brand-border)] bg-white shadow-xl"
        >
          {loading ? (
            <div className="px-3 py-2.5 text-sm text-slate-500">Buscando...</div>
          ) : options.length ? (
            options.map((option, index) => {
              const active = index === activeIndex;
              return (
                <button
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={active}
                  key={option.value}
                  type="button"
                  className={cn(
                    "grid w-full gap-0.5 border-b border-[var(--brand-border)] px-3 py-2.5 text-left text-sm last:border-b-0",
                    active ? "bg-[var(--brand-highlight)] text-white" : "hover:bg-[var(--brand-surface)]",
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    select(option);
                  }}
                >
                  <strong>{option.label}</strong>
                  {option.detail ? (
                    <span className={cn("text-xs", active ? "text-white/75" : "text-slate-500")}>
                      {option.detail}
                    </span>
                  ) : null}
                  {option.meta}
                </button>
              );
            })
          ) : (
            <div className="px-3 py-2.5 text-sm text-slate-500">{emptyText}</div>
          )}
        </div>
      ) : null}
      {hint && hasQuery ? <span className="text-xs text-slate-500">{hint}</span> : null}
      {error ? <span className="text-xs text-rose-600">{error}</span> : null}
    </div>
  );
});

Autocomplete.displayName = "Autocomplete";

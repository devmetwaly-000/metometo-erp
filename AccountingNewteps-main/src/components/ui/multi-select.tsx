"use client";

import * as React from "react";
import { X, Check, ChevronsUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Command, CommandGroup, CommandItem, CommandList, CommandInput, CommandEmpty } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export interface MultiSelectProps {
  options: Record<"value" | "label", string>[];
  selected: string[];
  onChange: (value: string[]) => void;
  className?: string;
  placeholder?: string;
}

const MultiSelect = React.forwardRef<
  HTMLButtonElement,
  MultiSelectProps
>(({ options, selected, onChange, className, placeholder = "Select...", ...props }, ref) => {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");

  const handleUnselect = (item: string) => {
    onChange(selected.filter((i) => i !== item));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Check if we are on client side before accessing document
    if (typeof document !== 'undefined') {
        const input = document.activeElement as HTMLInputElement;
        if (input && input.tagName === "INPUT" && input.value === "" && selected.length > 0) {
            if (e.key === "Backspace") {
                onChange(selected.slice(0, selected.length - 1));
            }
        }
    }
  };

  const selectedOptions = options.filter(option => selected.includes(option.value));
  const selectableOptions = options.filter(option => !selected.includes(option.value));

  return (
    <div className={cn("relative", className)} onKeyDown={handleKeyDown}>
        <Popover open={open} onOpenChange={setOpen} modal={true}>
            <PopoverTrigger asChild>
            <Button
                ref={ref}
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between h-auto min-h-10 px-3 py-2 hover:bg-background"
                onClick={() => setOpen(!open)}
            >
                <div className="flex flex-wrap gap-1">
                    {selectedOptions.length > 0 ? (
                        selectedOptions.map((option) => (
                            <Badge key={option.value} variant="secondary" className="mr-1 mb-1">
                                {option.label}
                                <span
                                    className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                    }}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleUnselect(option.value);
                                    }}
                                >
                                    <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                                </span>
                            </Badge>
                        ))
                    ) : (
                        <span className="text-muted-foreground font-normal">{placeholder}</span>
                    )}
                </div>
                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0" align="start">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder={placeholder}
                        value={inputValue}
                        onValueChange={setInputValue}
                    />
                    <CommandList>
                        <CommandEmpty>No results found.</CommandEmpty>
                        <CommandGroup>
                            {selectableOptions.filter(o => o.label && o.label.toLowerCase().includes(inputValue.toLowerCase())).map((option) => {
                                return (
                                    <CommandItem
                                        key={option.value}
                                        value={option.label || option.value}
                                        onSelect={() => {
                                            onChange([...selected, option.value]);
                                            setInputValue("");
                                        }}
                                        className={"cursor-pointer"}
                                    >
                                        <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary", false ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible")}>
                                            <Check className={cn("h-4 w-4")} />
                                        </div>
                                        {option.label}
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    </div>
  );
});

MultiSelect.displayName = "MultiSelect";

export { MultiSelect };

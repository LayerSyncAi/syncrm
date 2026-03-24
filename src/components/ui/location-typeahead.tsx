"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LocationTypeaheadProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  className?: string;
}

interface Prediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

let googleMapsLoaded = false;
let googleMapsLoading = false;
const loadCallbacks: (() => void)[] = [];

function loadGoogleMapsScript(): Promise<void> {
  return new Promise((resolve) => {
    if (googleMapsLoaded && window.google?.maps?.places) {
      resolve();
      return;
    }

    loadCallbacks.push(resolve);

    if (googleMapsLoading) return;
    googleMapsLoading = true;

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.warn("Google Maps API key not configured. Location typeahead will use fallback mode.");
      googleMapsLoading = false;
      loadCallbacks.forEach((cb) => cb());
      loadCallbacks.length = 0;
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      googleMapsLoaded = true;
      googleMapsLoading = false;
      loadCallbacks.forEach((cb) => cb());
      loadCallbacks.length = 0;
    };
    script.onerror = () => {
      googleMapsLoading = false;
      console.error("Failed to load Google Maps script");
      loadCallbacks.forEach((cb) => cb());
      loadCallbacks.length = 0;
    };
    document.head.appendChild(script);
  });
}

export function LocationTypeahead({
  value,
  onChange,
  placeholder = "Type to search a location...",
  disabled = false,
  error = false,
  className,
}: LocationTypeaheadProps) {
  const [inputValue, setInputValue] = useState(value);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mapsAvailable, setMapsAvailable] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sync external value changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Load Google Maps
  useEffect(() => {
    loadGoogleMapsScript().then(() => {
      if (window.google?.maps?.places) {
        autocompleteServiceRef.current = new google.maps.places.AutocompleteService();
        setMapsAvailable(true);
      }
    });
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  const fetchPredictions = useCallback(
    (input: string) => {
      if (!input.trim() || !autocompleteServiceRef.current) {
        setPredictions([]);
        setIsOpen(false);
        return;
      }

      setIsLoading(true);
      autocompleteServiceRef.current.getPlacePredictions(
        {
          input,
          types: ["geocode", "establishment"],
        },
        (results, status) => {
          setIsLoading(false);
          if (status === google.maps.places.PlacesServiceStatus.OK && results) {
            setPredictions(results as unknown as Prediction[]);
            setIsOpen(true);
            setHighlightIndex(-1);
          } else {
            setPredictions([]);
          }
        }
      );
    },
    []
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);

    // If no maps API, still allow free-text entry
    if (!mapsAvailable) {
      onChange(val);
      return;
    }

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      fetchPredictions(val);
    }, 300);
  };

  const handleSelect = (prediction: Prediction) => {
    const locationName = prediction.structured_formatting.main_text;
    setInputValue(prediction.description);
    onChange(prediction.description);
    setPredictions([]);
    setIsOpen(false);
    setHighlightIndex(-1);
  };

  const handleClear = () => {
    setInputValue("");
    onChange("");
    setPredictions([]);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || predictions.length === 0) {
      if (e.key === "Escape") setIsOpen(false);
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIndex((prev) => (prev < predictions.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIndex((prev) => (prev > 0 ? prev - 1 : predictions.length - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < predictions.length) {
          handleSelect(predictions[highlightIndex]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setHighlightIndex(-1);
        break;
    }
  };

  const handleBlur = () => {
    // Delay close so click on prediction registers
    setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setIsOpen(false);
        // If user typed something but didn't pick from dropdown, keep the text
        if (inputValue && inputValue !== value) {
          onChange(inputValue);
        }
      }
    }, 200);
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onFocus={() => {
            if (predictions.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "flex h-10 w-full rounded-[10px] border bg-transparent pl-9 pr-9 text-sm text-text outline-none transition duration-150",
            "placeholder:text-text-muted",
            "focus:ring-4 focus:ring-[rgba(59,130,246,0.18)]",
            error
              ? "border-danger focus:border-danger"
              : "border-border-strong hover:border-primary/60 focus:border-primary/60",
            disabled && "cursor-not-allowed opacity-50"
          )}
        />
        {inputValue && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted animate-spin" />
        )}
      </div>

      <AnimatePresence>
        {isOpen && predictions.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -4, scaleY: 0.95 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: -4, scaleY: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-1 w-full rounded-[10px] border border-border-strong bg-card-bg p-1.5 shadow-xl overflow-hidden"
            style={{ originY: "top" }}
          >
            <div className="max-h-64 overflow-y-auto">
              {predictions.map((prediction, index) => (
                <li
                  key={prediction.place_id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(prediction);
                  }}
                  onMouseEnter={() => setHighlightIndex(index)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-xs transition-colors",
                    index === highlightIndex
                      ? "bg-primary/10 text-primary-600"
                      : "text-text hover:bg-primary/5 hover:text-primary-600"
                  )}
                >
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                  <div className="min-w-0">
                    <span className="block font-medium truncate">
                      {prediction.structured_formatting.main_text}
                    </span>
                    <span className="block text-[10px] font-normal text-text-muted mt-0.5 truncate">
                      {prediction.structured_formatting.secondary_text}
                    </span>
                  </div>
                </li>
              ))}
            </div>
            <div className="mt-1 px-2 py-1 text-[9px] text-text-muted text-right opacity-60">
              Powered by Google
            </div>
          </motion.ul>
        )}
      </AnimatePresence>

      {!mapsAvailable && !isLoading && (
        <p className="mt-1 text-[10px] text-text-muted">
          Tip: Add a Google Maps API key for location suggestions
        </p>
      )}
    </div>
  );
}

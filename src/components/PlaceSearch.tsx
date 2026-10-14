'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Loader2, X } from 'lucide-react';

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
}

interface PlaceSearchProps {
  onSelectLocation: (lat: number, lon: number, name: string) => void;
  placeholder?: string;
  className?: string;
}

export default function PlaceSearch({
  onSelectLocation,
  placeholder = 'Search places, cities, landmarks...',
  className = '',
}: PlaceSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (searchTerm: string) => {
    setQuery(searchTerm);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    if (searchTerm.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    timeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            searchTerm
          )}&limit=5&addressdetails=1`
        );
        if (res.ok) {
          const data: NominatimResult[] = await res.json();
          setResults(data);
          setIsOpen(data.length > 0);
        }
      } catch (err) {
        console.error('Nominatim search error:', err);
      } finally {
        setLoading(false);
      }
    }, 400);
  };

  const handleSelect = (item: NominatimResult) => {
    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);
    if (!isNaN(lat) && !isNaN(lon)) {
      onSelectLocation(lat, lon, item.display_name);
      setIsOpen(false);
      setQuery('');
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative flex items-center">
        <Search className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          className="w-full pl-9 pr-8 py-2 bg-slate-900/90 hover:bg-slate-900 border border-slate-700/80 focus:border-blue-500 rounded-xl text-xs text-slate-100 placeholder-slate-400 focus:outline-none shadow-lg backdrop-blur-md transition-all"
        />
        {loading ? (
          <Loader2 className="absolute right-3 w-3.5 h-3.5 text-blue-400 animate-spin" />
        ) : query ? (
          <button
            onClick={() => {
              setQuery('');
              setResults([]);
              setIsOpen(false);
            }}
            className="absolute right-3 text-slate-400 hover:text-slate-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </div>

      {/* Results Dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-slate-900/95 border border-slate-700/80 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden z-[1100] max-h-60 overflow-y-auto">
          {results.map((item) => (
            <button
              key={item.place_id}
              onClick={() => handleSelect(item)}
              className="w-full px-3 py-2 text-left hover:bg-slate-800/80 border-b border-slate-800/60 last:border-b-0 flex items-start gap-2.5 transition-colors group"
            >
              <MapPin className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0 group-hover:scale-110 transition-transform" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-200 group-hover:text-blue-300 truncate">
                  {item.display_name.split(',')[0]}
                </p>
                <p className="text-[10px] text-slate-400 truncate">
                  {item.display_name}
                </p>
              </div>
              <span className="text-[9px] text-slate-500 font-mono shrink-0">
                {parseFloat(item.lat).toFixed(2)}, {parseFloat(item.lon).toFixed(2)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

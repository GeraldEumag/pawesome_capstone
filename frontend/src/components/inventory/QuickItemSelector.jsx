import React, { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { inventoryApi } from "../../api/inventory.jsx";

/**
 * Debounced searchable item dropdown for stock transactions. Matches the
 * backend /inventory/items/search endpoint (name, SKU, barcode, brand,
 * generic name). Selecting a result calls onSelect(item) and resets.
 */
const stockChip = (item) => {
  if ((item.stock ?? 0) <= 0) return { cls: "out", label: "Out of stock" };
  if ((item.stock ?? 0) <= (item.reorder_level ?? 0)) return { cls: "low", label: `${item.stock} ${item.unit || "units"} left` };
  return { cls: "in", label: `${item.stock} ${item.unit || "units"} available` };
};

const QuickItemSelector = ({ onSelect, excludeIds = [], placeholder = "Search item name, SKU, or barcode…", disabled = false }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIdx, setActiveIdx] = useState(-1);
  const containerRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults([]);
      setOpen(false);
      return undefined;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await inventoryApi.searchItems(term);
        setResults(Array.isArray(res?.items) ? res.items : []);
        setActiveIdx(-1);
        setError("");
        setOpen(true);
      } catch (err) {
        setResults([]);
        setError(err.message || "Search failed.");
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      listRef.current.children[activeIdx]?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx]);

  const pick = (item) => {
    setQuery("");
    setResults([]);
    setOpen(false);
    setActiveIdx(-1);
    onSelect(item);
  };

  const onKeyDown = (e) => {
    if (!open || loading || error || results.length === 0) {
      if (e.key === "Escape") setOpen(false);
      return;
    }
    const selectable = results.filter((i) => !excludeIds.includes(i.id));
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const dir = e.key === "ArrowDown" ? 1 : -1;
      let idx = activeIdx;
      for (let n = 0; n < results.length; n++) {
        idx = (idx + dir + results.length) % results.length;
        if (!excludeIds.includes(results[idx].id)) break;
      }
      setActiveIdx(idx);
    } else if (e.key === "Enter" && activeIdx >= 0 && results[activeIdx] && !excludeIds.includes(results[activeIdx].id)) {
      e.preventDefault();
      pick(results[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIdx(-1);
    }
  };

  return (
    <div className="sm-selector" ref={containerRef}>
      <div className="sm-field">
        <input
          type="text"
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-activedescendant={activeIdx >= 0 ? `sm-opt-${results[activeIdx]?.id}` : undefined}
          aria-label="Search inventory item"
        />
      </div>
      {open && (
        <div className="sm-selector-dropdown" role="listbox" ref={listRef}>
          {loading && (
            <div className="sm-selector-loading">
              <FontAwesomeIcon icon={faSpinner} spin /> Searching…
            </div>
          )}
          {!loading && error && <div className="sm-selector-empty">{error}</div>}
          {!loading && !error && results.length === 0 && (
            <div className="sm-selector-empty">
              <FontAwesomeIcon icon={faSearch} /> No matching active items.
            </div>
          )}
          {!loading && !error && results.map((item, idx) => {
            const chip = stockChip(item);
            const alreadyAdded = excludeIds.includes(item.id);
            return (
              <button
                key={item.id}
                id={`sm-opt-${item.id}`}
                type="button"
                role="option"
                aria-selected={idx === activeIdx}
                className={`sm-selector-option ${idx === activeIdx ? "active" : ""}`}
                disabled={alreadyAdded}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => pick(item)}
              >
                <span>
                  <span className="sm-item-name">{item.name}</span>
                  <span className="sm-item-meta">
                    {item.sku || "no SKU"}{item.brand ? ` · ${item.brand}` : ""}{item.category ? ` · ${item.category}` : ""}
                    {alreadyAdded ? " · already added" : ""}
                  </span>
                </span>
                <span className={`sm-stock-chip ${chip.cls}`}>{chip.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default QuickItemSelector;

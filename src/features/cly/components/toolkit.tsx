import * as RadixDropdown from "@radix-ui/react-dropdown-menu";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import { ChevronDown, GripVertical } from "lucide-react";
import {
  type HTMLAttributes,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Group, type Layout, Panel, Separator } from "react-resizable-panels";

function readLayout(id: string, secondarySize: number): Layout {
  if (typeof window === "undefined")
    return { primary: 100 - secondarySize, secondary: secondarySize };
  try {
    const stored = window.localStorage.getItem(`cly:split:${id}`);
    if (stored) return JSON.parse(stored) as Layout;
  } catch {
    // Invalid persisted UI state should never block the workspace.
  }
  return { primary: 100 - secondarySize, secondary: secondarySize };
}

export function ClySplitPane({
  id,
  primary,
  secondary,
  secondarySize = 38,
  primaryMin = "280px",
  secondaryMin = "280px",
  secondaryMax = "62%",
  label = "Resize panes",
  onSecondarySizeChange,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  id: string;
  primary: ReactNode;
  secondary: ReactNode;
  secondarySize?: number;
  primaryMin?: number | string;
  secondaryMin?: number | string;
  secondaryMax?: number | string;
  label?: string;
  onSecondarySizeChange?: (size: number) => void;
}) {
  const defaultLayout = useMemo(
    () => readLayout(id, secondarySize),
    [id, secondarySize],
  );
  const useFallback =
    typeof navigator !== "undefined" && navigator.userAgent.includes("jsdom");
  const persist = (layout: Layout, isUserInteraction: boolean) => {
    window.localStorage.setItem(`cly:split:${id}`, JSON.stringify(layout));
    if (isUserInteraction)
      onSecondarySizeChange?.(layout.secondary ?? secondarySize);
  };
  if (useFallback) {
    return (
      <div className={`cly-resizable-group ${className}`} {...props}>
        <div className="cly-resizable-panel">{primary}</div>
        <hr
          className="cly-resize-handle"
          aria-label={label}
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={secondarySize}
          tabIndex={0}
        />
        <div className="cly-resizable-panel">{secondary}</div>
      </div>
    );
  }
  return (
    <Group
      id={id}
      className={`cly-resizable-group ${className}`}
      defaultLayout={defaultLayout}
      onLayoutChanged={(layout, meta) =>
        persist(layout, meta.isUserInteraction)
      }
      orientation="horizontal"
      {...props}
    >
      <Panel id="primary" minSize={primaryMin}>
        <div className="cly-resizable-panel">{primary}</div>
      </Panel>
      <Separator className="cly-resize-handle" aria-label={label}>
        <GripVertical size={11} aria-hidden="true" />
      </Separator>
      <Panel
        id="secondary"
        minSize={secondaryMin}
        maxSize={secondaryMax}
        collapsible
        collapsedSize={0}
      >
        <div className="cly-resizable-panel">{secondary}</div>
      </Panel>
    </Group>
  );
}

export function ClyVirtualList<T>({
  items,
  estimateSize,
  height,
  getKey,
  renderItem,
  label,
  className = "",
}: {
  items: readonly T[];
  estimateSize: number;
  height: number;
  getKey: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  label: string;
  className?: string;
}) {
  const parentRef = useRef<HTMLUListElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 8,
    getItemKey: (index) => getKey(items[index]),
  });
  return (
    <ul
      ref={parentRef}
      className={`cly-tanstack-virtual ${className}`}
      style={{ height }}
      aria-label={label}
    >
      <div
        className="cly-tanstack-virtual-inner"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((row) => (
          <li
            key={row.key}
            className="cly-tanstack-virtual-row"
            style={{
              height: row.size,
              transform: `translateY(${row.start}px)`,
            }}
          >
            {renderItem(items[row.index], row.index)}
          </li>
        ))}
      </div>
    </ul>
  );
}

function readVisibility(id: string): VisibilityState {
  try {
    return JSON.parse(
      window.localStorage.getItem(`cly:table:${id}:columns`) ?? "{}",
    ) as VisibilityState;
  } catch {
    return {};
  }
}

export function ClyDataTable<T>({
  id,
  data,
  columns,
  selectedId,
  getRowId,
  onSelect,
  emptyMessage = "No matching records",
}: {
  id: string;
  data: T[];
  columns: ColumnDef<T, unknown>[];
  selectedId?: string | null;
  getRowId: (row: T) => string;
  onSelect?: (row: T) => void;
  emptyMessage?: string;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    () => readVisibility(id),
  );
  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, columnVisibility },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: (updater) => {
      setColumnVisibility((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        window.localStorage.setItem(
          `cly:table:${id}:columns`,
          JSON.stringify(next),
        );
        return next;
      });
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId,
  });
  return (
    <div className="cly-table-wrap cly-tanstack-table" data-table-id={id}>
      <table className="cly-table">
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <th
                  key={header.id}
                  aria-sort={
                    header.column.getIsSorted() === "asc"
                      ? "ascending"
                      : header.column.getIsSorted() === "desc"
                        ? "descending"
                        : "none"
                  }
                >
                  <button
                    type="button"
                    className="cly-table-sort"
                    disabled={!header.column.getCanSort()}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                    {header.column.getCanSort() ? (
                      <ChevronDown
                        size={11}
                        data-sort={header.column.getIsSorted() || "none"}
                      />
                    ) : null}
                  </button>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              tabIndex={0}
              data-selected={selectedId === row.id}
              onClick={() => onSelect?.(row.original)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect?.(row.original);
                }
              }}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!table.getRowModel().rows.length ? (
        <div className="cly-table-empty" role="status">
          {emptyMessage}
        </div>
      ) : null}
    </div>
  );
}

export function ClyTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <RadixTooltip.Provider delayDuration={350}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content className="cly-tooltip" sideOffset={6}>
            {label}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}

export function ClyMenu({
  label,
  trigger,
  items,
}: {
  label: string;
  trigger: ReactNode;
  items: {
    id: string;
    label: string;
    onSelect: () => void;
    disabled?: boolean;
  }[];
}) {
  return (
    <RadixDropdown.Root>
      <RadixDropdown.Trigger asChild>{trigger}</RadixDropdown.Trigger>
      <RadixDropdown.Portal>
        <RadixDropdown.Content
          className="cly-radix-menu"
          aria-label={label}
          sideOffset={5}
        >
          {items.map((item) => (
            <RadixDropdown.Item
              className="cly-radix-menu-item"
              key={item.id}
              disabled={item.disabled}
              onSelect={item.onSelect}
            >
              {item.label}
            </RadixDropdown.Item>
          ))}
        </RadixDropdown.Content>
      </RadixDropdown.Portal>
    </RadixDropdown.Root>
  );
}

export function ClyTerminal({
  lines,
  label,
}: {
  lines: string[];
  label: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const useFallback =
    typeof navigator !== "undefined" && navigator.userAgent.includes("jsdom");
  useEffect(() => {
    const host = hostRef.current;
    if (!host || useFallback) return;
    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: false,
      disableStdin: true,
      fontFamily: "var(--cly-mono)",
      fontSize: 12,
      lineHeight: 1.45,
      theme: {
        background: "#0e1110",
        foreground: "#d6ded8",
        cursor: "#9c9ffa",
        green: "#7cc995",
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(host);
    terminal.writeln(lines.join("\r\n"));
    const resize = new ResizeObserver(() => fit.fit());
    resize.observe(host);
    requestAnimationFrame(() => fit.fit());
    return () => {
      resize.disconnect();
      terminal.dispose();
    };
  }, [lines, useFallback]);
  return (
    <div ref={hostRef} className="cly-xterm" role="log" aria-label={label}>
      {useFallback ? <pre>{lines.join("\n")}</pre> : null}
    </div>
  );
}

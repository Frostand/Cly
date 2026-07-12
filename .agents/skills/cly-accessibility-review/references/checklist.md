# Accessibility checklist

- One clear accessible name per interactive control
- Visible `:focus-visible` ring on dark and light surfaces
- Dialog focus trap, Escape close, trigger focus restoration
- Menu arrow navigation and Escape close
- Tabs use tablist/tab/tabpanel semantics
- Table headers expose sorting; rows are keyboard selectable
- Split handles expose separator role, orientation, value, and arrow resizing
- Graph shortcuts remain inside the focused graph
- Status is conveyed with text, not color alone
- Motion respects `prefers-reduced-motion`
- Live updates use restrained `aria-live`; terminal logs do not announce every render
- No serious/critical axe violations in primary workflows

# charts

Chart wrappers built on a single charting library, styled from the design system
tokens (`--chart-1` … `--chart-5`).

Feature code must not import the charting library directly. Wrapping it here
means the theme, the accessible colour order, and the empty/loading states are
applied consistently — and the library stays replaceable.

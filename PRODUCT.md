# Product

## Register

product

## Users

The maintainer (playing Revolution Idle, checking in episodically, often
mid-run in another tab) and a small community of other players of the same
game. Users arrive with real in-game numbers in hand (current mult, tree
levels, tarot speed) and want an answer fast: what to buy next, how long a
push will take, which path reaches a goal mult soonest. Sessions are short
and data-entry-heavy — this is a tool opened between game actions, not
browsed for its own sake.

## Product Purpose

A reverse-engineered planner for Revolution Idle's Singularity layer: enter
current stats and tree state, get an optimal or hand-tuned path to a target
mult or atom exponent, compare scenarios side by side. Success is a correct,
fast answer the player can act on immediately in-game — not engagement, not
retention, not a polished funnel.

## Brand Personality

Precise, dense, unadorned — a calculator/terminal for theorycrafters, not a
showcase. Numbers and their relationships carry the interface; decoration
that doesn't serve reading the data is noise. Confidence comes from
correctness (and being explicit about what's confirmed vs. still a guess),
not from visual flourish.

## Anti-references

Not a SaaS landing page. No gradient hero sections, no marketing card grids,
no promotional chrome. Every pixel should earn its place by helping someone
read or enter a number faster.

## Design Principles

- Data density over whitespace-for-its-own-sake — this is a working tool for
  repeat, fast use, not a first-impression surface.
- Never blur the line between confirmed game data and this project's own
  estimates/guesses; the UI should make that distinction visible, not just
  the docs.
- Numeric input and output are the primary content; layout, color, and type
  choices serve scanability of numbers first.
- Reversible, low-ceremony interactions (inline edits, no confirmation
  modals except for destructive actions like clearing all plans).
- Match the game's own visual language (the Singularity Tree's star/radial
  layout) where it helps recognition, without importing game chrome that
  doesn't serve the planner's job.

## Accessibility & Inclusion

WCAG AA, strictly: body text ≥4.5:1 contrast (including placeholder text),
large/bold text ≥3:1, every animation has a `prefers-reduced-motion`
alternative, all interactive elements keyboard-reachable and focus-visible.

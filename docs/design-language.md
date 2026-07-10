# v2 Design Language

The visual and interaction vocabulary for cali.so v2. Everything here extends
the component stack in ADR-0006 (motion is information, not decoration).

## Typography first

The site is typography-forward: a spare sans stack (Geist for Latin, Frex Sans
GB for CJK), strong weight contrast for hierarchy, generous whitespace, and
restrained color. Decoration lives in interactions, not in the base layout —
the resting state of any page should feel calm and text-driven.

## Writing style

Titles do the work. Post listings show concise, conversational titles without
descriptions; section headers are short and personal. Copy avoids jargon and
reads like speech.

## Hover cards as craft objects

Inline links to external presences (social profiles, code, films, music) reveal
rich hover cards — each one designed per service rather than from a generic
template: a profile card feels like the service it links to, a films card can
show poster art, a music card can show what's playing. Cards animate on spring
physics and reward attention without blocking task flow. Build these on the
fluid component idiom (proximity hover, interruptible springs).

## Fluid page transitions

Navigation feels continuous, not paged: entering a post from the writing index
morphs shared elements (cover, title) rather than cutting. Use the View
Transitions API via Next's support; transitions must respect
`prefers-reduced-motion`.

## Instant-photo cover treatment

Each post's cover image is framed like an instant-print photograph: white
border with a heavier bottom edge, subtle shadow and slight rotation in
listings, room for a handwritten-feel caption or date stamp. The cover is the
post's visual identity across the index, the post page, and OG images.

## Ambient background

A barely-there dot matrix and hairline grid lines give pages spatial texture
without competing with content. Opacity stays near the threshold of
perception; dark mode gets its own tuned values.

## Micro-interaction craft

Small interactions get disproportionate care: cursors, focus rings, copy
buttons, theme switches. Every interactive element should have a considered
hover, active, and focus state. Prefer one polished interaction over three
default ones.

## Illustration accents

Diagrams and decorative accents use a hand-drawn technical style — fine
line-weight, slightly imperfect strokes — rather than stock or flat-vector
looks. Used sparingly, mostly within posts.

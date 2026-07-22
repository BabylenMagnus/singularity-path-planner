# Singularity Path Planner

Client-side planner for Revolution Idle's Singularity layer: mult-goal path search,
push-target planner, single-node tree rush, editable scenarios, and a tree
cost-estimation system cross-checked against community spreadsheets and real
in-game readings. No build step — plain HTML/CSS/JS, ES modules.

See `NOTES/` for the model documentation (formulas, known gaps, architecture)
and `PRODUCT.md`/`DESIGN.md` for product/design notes.

## Running locally

No build step, no dependencies. Either open `index.html` directly in a
browser, or serve the directory with any static file server (e.g.
`node server.js`, `python -m http.server`, or your tool of choice) and open
it over `http://` — some browsers restrict ES module imports over the
`file://` protocol.

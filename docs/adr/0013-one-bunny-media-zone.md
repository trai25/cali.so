# Use one Bunny Media zone with path-separated delivery

The Media Library uses the existing Rendition Storage Zone as its single Bunny
Media zone because separate Original and Rendition zones add operational
configuration without improving the application workflow. Originals,
Renditions, and transfer chunks remain separate object namespaces in that zone.
The Pull Zone delivers only `/renditions/*`; Bunny `Block Request` Edge Rules
deny `/originals/*` and `/transfer-chunks/*` so raw metadata and in-progress
bytes are not public. Browser writes continue through bounded same-origin Route
Handlers because Bunny's S3 endpoint has no browser-upload CORS contract.

This supersedes only ADR-0007's two-zone topology. Its Neon catalog,
publication, verification, and resumable-operation decisions remain accepted.

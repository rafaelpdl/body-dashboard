# Privacy notes

This dashboard is designed so the static host does not receive the health measurements.

- Measurements arrive in a URL fragment (`#sync=...`). Per standard browser URL behavior, fragments are handled client-side and are not included in the HTTP request to the server.
- After import, the fragment is removed with `history.replaceState`.
- Measurements are stored in IndexedDB for the dashboard origin on the iPhone.
- No third-party JavaScript, analytics, fonts, images, APIs, advertising, or telemetry are included.
- The Content Security Policy limits resources to the same origin.

## Remaining trust assumptions

The JavaScript served by the dashboard origin can access that origin's IndexedDB. Therefore, protect your GitHub account and repository: a malicious future code change served from the same origin could read locally stored data.

Safari/site data can also be cleared or evicted. Apple Health is the authoritative source. Use the dashboard's JSON backup as an optional additional copy.

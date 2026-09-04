# Youth_Plan_AI-Inha

## Emergency maintenance page

The web app includes a maintenance response that is disabled by default. Set
`MAINTENANCE_MODE=true` on the web service to return the maintenance page with
HTTP 503 for every user-facing route. Remove the variable or set it to `false`
to restore the normal app.

For local preview:

```sh
cd web
MAINTENANCE_MODE=true pnpm dev
```

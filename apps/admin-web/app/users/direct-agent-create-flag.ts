// Server-only gate for the staging direct Agent-create surface.
//
// This is intentionally NOT a NEXT_PUBLIC_ flag: it is read only on the server
// (the Users server component that decides whether to render the form, and the
// mutation route that performs the create). The control is therefore absent from
// the UI and the route returns 404 unless the flag is exactly the string "true".
// It defaults OFF everywhere (absent env, empty, "false", "TRUE", "1" => off).
export function isStagingDirectAgentCreateEnabled(): boolean {
  return process.env.ENABLE_STAGING_DIRECT_AGENT_CREATE === 'true';
}

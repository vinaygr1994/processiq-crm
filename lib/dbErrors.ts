/** Turns raw database errors into something a CRM user can act on. */
export function friendlyDbError(msg: string): string {
  if (/schema cache|does not exist|relation .+ not found/i.test(msg))
    return "This feature needs a quick database update. Ask your account owner to redeploy the CRM (or run supabase/schema.sql in Supabase), then try again.";
  if (/row-level security|permission denied/i.test(msg)) return "You don't have permission to change this. Ask your account owner for access.";
  if (/duplicate key|already exists/i.test(msg)) return "Something with that name or key already exists. Try a different one.";
  return msg;
}

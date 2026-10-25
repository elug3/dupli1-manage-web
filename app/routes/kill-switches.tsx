import { redirect } from "react-router";

/** Kill switches moved into /settings; keep old links and bookmarks working. */
export function loader() {
  return redirect("/settings#kill-switches");
}

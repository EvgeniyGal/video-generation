import { redirect } from "next/navigation";

/** Legacy URL — blueprints were renamed to templates. */
export default function BlueprintsRedirectPage() {
  redirect("/templates");
}

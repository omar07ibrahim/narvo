export const dynamic = "force-dynamic";

import { ContactConsole } from "./_components/contact-console";
import { loadConsoleData } from "./_lib/data";

export default function Page() {
  return <ContactConsole initial={loadConsoleData()} />;
}

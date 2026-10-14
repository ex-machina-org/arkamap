import { useState } from "react";
import { ApiAnswer } from "@/components/application/agent-chat/api-answer";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { ASK_INPUT_LABEL, useJev } from "@/hooks/use-jev";
import { DashboardCard } from "./dashboard-card";
import { KodamaIcon } from "@/components/foundations/brand/kodama-icon";

export function JevPanel() {
  const [question, setQuestion] = useState("");
  const jev = useJev();
  return <DashboardCard title="Tanya Kodama" description="Ajukan pertanyaan tentang wilayah dan data Anda. Sumber jawaban ditampilkan di bawahnya.">
    <form className="flex flex-col gap-2" onSubmit={event => { event.preventDefault(); void jev.ask(question); }}>
      <Input aria-label={ASK_INPUT_LABEL} placeholder="Contoh: wilayah mana yang paling perlu perhatian?" value={question} onChange={setQuestion} isRequired maxLength={1000} />
      <Button type="submit" leadingIcon={KodamaIcon} disabled={jev.busy}>{jev.busy ? jev.step : "Tanyakan ke Kodama"}</Button>
    </form>
    <ApiAnswer {...jev} onCancel={jev.cancel} />
  </DashboardCard>;
}

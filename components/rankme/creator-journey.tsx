import { Check } from "lucide-react";
export function CreatorJourney({current}: {current: 0|1|2|3}) {
  return <ol className="creator-journey" aria-label="Cesta k umístění profilu">
    {["Připojit účet", "Zkontrolovat náhled", "Promo nebo platba", "Výsledek a statistiky"].map((label,index)=><li key={label} aria-current={index===current?'step':undefined} data-complete={index<current}><span aria-hidden="true">{index<current?<Check size={14}/>:index+1}</span><span>{label}</span></li>)}
  </ol>;
}
